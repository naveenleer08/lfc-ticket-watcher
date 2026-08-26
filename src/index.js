import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { fetchHomeFixtures, fetchMatch, isLive, isFinished } from './lfc.js';
import { loadState, saveState, itemKey } from './state.js';
import { londonToDate, formatLondon, humanCountdown } from './time.js';
import { notify, channel } from './notify.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = join(ROOT, 'state.json');
const DRY_RUN = process.argv.includes('--dry-run');

const now = new Date();
const alerts = [];

// Set when the site could not be read. While degraded we must never send the
// reassuring "nothing new" heartbeat — silence would look like good news.
let degraded = false;

function raise(priority, subject, lines) {
  alerts.push({ priority, subject, lines });
}

function matchesAny(title, patterns) {
  const t = title.toLowerCase();
  return patterns.some((p) => t.includes(p.toLowerCase()));
}

// The sale blurb is multi-line; each paragraph must be its own entry so both
// the issue markdown and the email HTML break it correctly.
function bodyLines(body) {
  return body ? body.split('\n') : [];
}

function isRegistration(title) {
  return /registration|register/i.test(title);
}

// ---------------------------------------------------------------------------

async function main() {
  const config = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf8'));
  const state = await loadState(STATE_PATH);
  const bootstrap = Object.keys(state.matches).length === 0;

  let slugs = await fetchHomeFixtures();
  if (config.onlyOpponents && config.onlyOpponents.length) {
    slugs = slugs.filter((s) => config.onlyOpponents.some((o) => s.includes(o.toLowerCase())));
  }

  if (slugs.length === 0) {
    warnBroken(state, 'No home fixtures found on liverpoolfc.com/tickets - the page layout may have changed.');
    await finish(state, false, [], config);
    return;
  }

  const seen = [];
  let parsedAnyItems = false;

  for (const slug of slugs) {
    let match;
    try {
      match = await fetchMatch(slug);
    } catch (err) {
      console.error(`! ${slug}: ${err.message}`);
      continue;
    }
    if (match.items.length) parsedAnyItems = true;

    const watched = match.items.filter((i) => matchesAny(i.title, config.watchTitlePatterns));
    const prev = (state.matches[slug] && state.matches[slug].items) || {};
    const next = {};

    for (const item of watched) {
      const key = itemKey(item.title);
      const before = prev[key];
      next[key] = {
        statusSlug: item.statusSlug,
        statusLabel: item.statusLabel,
        when: item.when,
        title: item.title,
      };

      const label = `${match.heading} - ${item.title}`;
      const whenDate = londonToDate(item.when);

      if (!before) {
        // The headline event. Until LFC creates the sale on the match page
        // there is nothing there at all, so its appearance is the signal.
        const reg = isRegistration(item.title);
        raise(
          reg ? 'high' : 'normal',
          reg ? `Registration announced: ${match.heading}` : `Sale announced: ${match.heading}`,
          [
            `# ${label}`,
            `Status: ${item.statusLabel || item.statusSlug || 'unknown'}`,
            whenDate
              ? `Opens: ${formatLondon(whenDate)} (${humanCountdown(whenDate - now)})`
              : 'No time published yet.',
            '',
            ...bodyLines(item.body),
            '',
            match.url,
          ]
        );
      } else {
        if (before.statusSlug !== item.statusSlug) {
          const live = isLive(item.statusSlug);
          const lines = [
            `# ${label}`,
            `${before.statusLabel || before.statusSlug} -> ${item.statusLabel || item.statusSlug}`,
          ];
          if (live) lines.push('This is live right now.');
          lines.push('', ...bodyLines(item.body), '', match.url);
          raise(
            live ? 'critical' : isFinished(item.statusSlug) ? 'low' : 'high',
            live
              ? `OPEN NOW: ${match.heading} - ${item.title}`
              : `Status changed: ${match.heading} - ${item.title}`,
            lines
          );
        }
        if (before.when !== item.when) {
          raise('high', `Time changed: ${match.heading} - ${item.title}`, [
            `# ${label}`,
            `Was: ${before.when ? formatLondon(londonToDate(before.when)) : 'not published'}`,
            `Now: ${whenDate ? formatLondon(whenDate) : 'not published'}`,
            '',
            match.url,
          ]);
        }
      }

      // Advance reminders. Scheduled runs on GitHub Actions can be delayed by
      // several minutes under load, so we warn ahead of the published time
      // rather than trying to catch the exact moment the status flips.
      if (whenDate && !isLive(item.statusSlug) && !isFinished(item.statusSlug)) {
        for (const lead of config.reminderLeadMinutes || []) {
          const fireAt = whenDate.getTime() - lead * 60000;
          const alertKey = `${slug}::${key}::lead${lead}`;
          if (now.getTime() >= fireAt && now < whenDate && !state.sentAlerts[alertKey]) {
            state.sentAlerts[alertKey] = now.toISOString();
            raise(
              lead <= 60 ? 'critical' : 'high',
              `${humanCountdown(whenDate - now)}: ${match.heading} - ${item.title}`,
              [
                `# ${label}`,
                `${isRegistration(item.title) ? 'Registration opens' : 'Sale starts'} ${formatLondon(whenDate)}.`,
                '',
                ...bodyLines(item.body),
                '',
                match.url,
              ]
            );
          }
        }
      }
    }

    state.matches[slug] = {
      heading: match.heading,
      kickoff: match.kickoff,
      url: match.url,
      items: next,
    };
    seen.push({ slug, heading: match.heading, items: watched });
  }

  // Forget fixtures that have dropped off the listing (i.e. been played).
  for (const slug of Object.keys(state.matches)) {
    if (!seen.some((s) => s.slug === slug)) delete state.matches[slug];
  }

  if (!parsedAnyItems) {
    warnBroken(
      state,
      'Fixtures were found, but no ticket sale sections could be parsed on any of them. The page markup has probably changed.'
    );
  }

  await finish(state, bootstrap, seen, config);
}

// ---------------------------------------------------------------------------

function warnBroken(state, message) {
  degraded = true;
  const key = `__broken::${now.toISOString().slice(0, 10)}`;
  if (state.sentAlerts[key]) return;
  state.sentAlerts[key] = now.toISOString();
  raise('high', 'LFC watcher may be broken', [
    '# The watcher could not read the ticket pages',
    message,
    '',
    'It will keep trying, but treat its silence as unreliable until this is fixed.',
  ]);
}

async function finish(state, bootstrap, seen, config) {
  if (bootstrap) {
    // First run: adopt the current state of the world, and send one summary
    // rather than an alert for every sale that already exists.
    const lines = [
      '# LFC ticket watcher is now running',
      '',
      `Watching ${seen.length} home fixture${seen.length === 1 ? '' : 's'}. Current position:`,
      '',
    ];
    for (const m of seen) {
      if (!m.items.length) {
        lines.push(`${m.heading} - no Additional Members Sale announced yet`);
      } else {
        for (const i of m.items) {
          const d = londonToDate(i.when);
          lines.push(
            `${m.heading} - ${i.title}: ${i.statusLabel || i.statusSlug}${d ? ` (${formatLondon(d)})` : ''}`
          );
        }
      }
    }
    lines.push(
      '',
      'You will be alerted as soon as a new registration window appears, and again before it opens.'
    );
    alerts.length = 0;
    raise('normal', 'LFC ticket watcher started', lines);
    // The start-up summary counts as the first heartbeat, so the next quiet
    // check-in is a full interval away rather than 15 minutes later.
    state.lastHeartbeat = now.toISOString();
  } else if (alerts.length === 0 && config.heartbeatDays && !degraded) {
    const last = state.lastHeartbeat ? new Date(state.lastHeartbeat) : null;
    if (!last || now - last >= config.heartbeatDays * 86400000) {
      state.lastHeartbeat = now.toISOString();
      const pending = seen.flatMap((m) =>
        m.items.map((i) => `${m.heading} - ${i.title}: ${i.statusLabel || i.statusSlug}`)
      );
      raise('low', 'LFC watcher: still watching, nothing new', [
        '# Nothing to do',
        `Checked ${seen.length} home fixtures. No new Additional Members Sale has been announced.`,
        '',
        ...(pending.length
          ? ['Currently showing:', ...pending]
          : ['No sales are currently listed on any home fixture.']),
      ]);
    }
  }

  await deliver();
  await saveState(STATE_PATH, state);
}

async function deliver() {
  if (alerts.length === 0) {
    console.log('No alerts.');
    return;
  }

  const urgent = alerts.filter((a) => a.priority === 'critical' || a.priority === 'high');
  const rest = alerts.filter((a) => a.priority !== 'critical' && a.priority !== 'high');

  const outbox = [...urgent];
  if (rest.length === 1) {
    outbox.push(rest[0]);
  } else if (rest.length > 1) {
    outbox.push({
      priority: 'normal',
      subject: `LFC tickets: ${rest.length} updates`,
      lines: rest.flatMap((a) => [...a.lines, '', '---', '']),
    });
  }

  for (const alert of outbox) {
    if (DRY_RUN) {
      console.log(`\n=== [${alert.priority}] ${alert.subject} ===\n${alert.lines.join('\n')}`);
      continue;
    }
    await notify(alert);
    console.log(`sent: [${alert.priority}] ${alert.subject}`);
  }
}

// ---------------------------------------------------------------------------

if (process.argv.includes('--test')) {
  await notify({
    priority: 'normal',
    subject: 'LFC ticket watcher - test alert',
    lines: [
      '# Test email',
      'If you are reading this, alerts will reach you.',
      '',
      `Sent ${formatLondon(new Date())}.`,
    ],
  });
  console.log(`Test alert sent via ${channel()}.`);
} else {
  await main();
}
