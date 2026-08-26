// Fetching and parsing of liverpoolfc.com ticket pages.
//
// The match pages are server-rendered, so a plain fetch gets us everything —
// no browser, no JS execution. Each sale on a match page is an accordion item
// carrying a stable data-testid, a status slug, and a machine-readable time:
//
//   <span class="... statusIndicator--register-soon ..." data-testid="ticketing-accordion-list-item__status">
//     <span data-testid="ticketing-status-indicator__label">REGISTER SOON</span>
//   </span>
//   <time datetime="2026-09-01T11:00" data-testid="ticketing-accordion-list-item__sale-date">…</time>

import * as cheerio from 'cheerio';

const BASE = 'https://www.liverpoolfc.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

async function get(path) {
  const url = path.startsWith('http') ? path : BASE + path;
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

// The fixtures listing paginates behind a "LOAD MORE" button, but the first
// page reaches ~2 months ahead — comfortably beyond the ~2 week window in which
// an Additional Members Sale is announced.
export async function fetchHomeFixtures() {
  const $ = cheerio.load(await get('/tickets'));

  const slugs = new Set();
  $('a[href*="/tickets/match/"]').each((_, el) => {
    const href = ($(el).attr('href') || '').split('?')[0];
    const m = href.match(/\/tickets\/match\/([^/]+)$/);
    if (!m) return;
    const slug = m[1];
    // Men's home games only: "liverpool-v-…", excluding the women's team.
    if (!slug.startsWith('liverpool-v-')) return;
    if (/women/.test(slug)) return;
    slugs.add(slug);
  });

  return [...slugs];
}

function textOf($el) {
  return $el.text().replace(/\s+/g, ' ').trim();
}

// The sale blurb is several paragraphs with no whitespace between the tags, so
// a plain .text() runs them together ("...their interest.Registration will
// open..."). Break on block boundaries first — this text is the most useful
// part of an alert and it has to be readable.
function blockTextOf($, $el) {
  if (!$el.length) return '';
  const clone = $el.clone();
  clone.find('br').replaceWith('\n');
  clone.find('p, div, li, h1, h2, h3, h4, h5').each((_, e) => $(e).after('\n'));
  return clone
    .text()
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export async function fetchMatch(slug) {
  const $ = cheerio.load(await get(`/tickets/match/${slug}`));

  const items = [];
  $('[data-testid="ticketing-accordion-list-item"]').each((_, el) => {
    const $el = $(el);
    const title = textOf($el.find('[data-testid="ticketing-accordion-list-item__title"]').first());
    if (!title) return;

    const $status = $el.find('[data-testid="ticketing-accordion-list-item__status"]').first();
    const statusLabel = textOf($status.find('[data-testid="ticketing-status-indicator__label"]').first());
    const statusSlug = (($status.attr('class') || '').match(/statusIndicator--([a-z-]+)/) || [])[1] || null;

    const $time = $el.find('[data-testid="ticketing-accordion-list-item__sale-date"]').first();
    const when = $time.attr('datetime') || null;

    items.push({
      title,
      statusSlug,
      statusLabel: statusLabel || null,
      when,
      whenText: textOf($time) || null,
      body: blockTextOf($, $el.find('[data-testid="ticketing-accordion-list-item__body"]').first()).slice(0, 1200),
    });
  });

  // The fixture header. There is no <h1> on these pages, so fall back to
  // deriving a name from the slug if the header markup ever moves.
  const field = (name) =>
    textOf($(`[data-testid="hospitality-fixture-header__${name}"]`).first()) || null;
  const home = field('team-home');
  const away = field('team-away');

  return {
    slug,
    url: `${BASE}/tickets/match/${slug}`,
    heading: home && away ? `${home} v ${away}` : headingFromSlug(slug),
    venue: field('venue'),
    kickoff: [field('date'), field('kickoff')].filter(Boolean).join(' ') || null,
    competition: field('competition-name'),
    items,
  };
}

function headingFromSlug(slug) {
  const opponent = slug
    .replace(/^liverpool-v-/, '')
    .replace(/-(english-premier-league|premier-league|carabao-cup|fa-cup|uefa-champions-league)\b/g, '')
    .replace(/-\d{8}$/, '')
    .replace(/-\d{4}-\d{2}$/, '')
    .replace(/-\d{1,2}-[a-z]{3}-\d{4}$/, '')
    .replace(/-/g, ' ')
    .trim();
  return `Liverpool v ${opponent.replace(/\b\w/g, (c) => c.toUpperCase())}`;
}

// "REGISTRATION ENDED" / "SALE ENDED" / "CHECK AVAILABILITY" / "BUY NOW" /
// "REGISTER SOON" / "ON SALE SOON" are the values seen in the wild. Anything
// ending in "-now" is treated as live; the set is open, so unknown values are
// still reported rather than silently dropped.
export function isLive(statusSlug) {
  return typeof statusSlug === 'string' && /-now$/.test(statusSlug);
}

export function isFinished(statusSlug) {
  return typeof statusSlug === 'string' && /-ended$/.test(statusSlug);
}
