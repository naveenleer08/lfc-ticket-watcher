// Two ways out, picked automatically.
//
//   GitHub issue (default) - uses the token GitHub Actions injects into every
//     run. Nothing to configure: you already watch your own repositories, so
//     GitHub emails you when an issue is opened. No password anywhere.
//
//   SMTP - only if SMTP_HOST is set. Sends a normal email instead. Nicer
//     subject lines, but needs a mail app password in repository secrets.
//
// Both take the same { subject, lines, priority } shape.

const PRIORITY_TAG = {
  critical: '\u{1F6A8}',
  high: '\u{1F534}',
  normal: '\u{1F4E3}',
  low: 'ℹ️',
};

export function channel() {
  if (process.env.SMTP_HOST) return 'email';
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) return 'issue';
  return 'none';
}

export async function notify(alert) {
  switch (channel()) {
    case 'email':
      return sendEmail(alert);
    case 'issue':
      return openIssue(alert);
    default:
      throw new Error(
        'No way to reach you: set SMTP_HOST for email, or run inside GitHub Actions for issue alerts.'
      );
  }
}

// --- GitHub issues ---------------------------------------------------------

async function openIssue({ subject, lines, priority = 'normal' }) {
  const repo = process.env.GITHUB_REPOSITORY;
  const tag = PRIORITY_TAG[priority] || '';

  const body =
    lines
      .map((l) => (l.startsWith('# ') ? `## ${l.slice(2)}` : l))
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() +
    '\n\n---\n\nOpened automatically by the LFC ticket watcher. Close it once you have acted.';

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'lfc-ticket-watcher',
    },
    body: JSON.stringify({ title: `${tag} ${subject}`.trim(), body }),
  });

  if (!res.ok) {
    throw new Error(`GitHub issue failed: HTTP ${res.status} ${await res.text()}`);
  }
}

// --- SMTP ------------------------------------------------------------------

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

let transport;
async function getTransport() {
  if (transport) return transport;
  // Imported lazily so the GitHub-issue path has no dependency on it.
  const { default: nodemailer } = await import('nodemailer');
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host: required('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: { user: required('SMTP_USER'), pass: required('SMTP_PASS') },
  });
  return transport;
}

async function sendEmail({ subject, lines, priority = 'normal' }) {
  const tag = PRIORITY_TAG[priority] || '';
  const html =
    '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">' +
    lines
      .map((l) => {
        if (l === '') return '<div style="height:10px"></div>';
        if (l.startsWith('# ')) return `<h2 style="margin:0 0 10px;color:#c8102e">${esc(l.slice(2))}</h2>`;
        if (/^https?:\/\//.test(l)) return `<p style="margin:4px 0"><a href="${esc(l)}">${esc(l)}</a></p>`;
        return `<p style="margin:4px 0">${esc(l)}</p>`;
      })
      .join('') +
    '</div>';

  const mailer = await getTransport();
  await mailer.sendMail({
    from: process.env.MAIL_FROM || required('SMTP_USER'),
    to: required('MAIL_TO'),
    subject: `${tag} ${subject}`.trim(),
    text: lines.join('\n'),
    html,
    priority: priority === 'critical' || priority === 'high' ? 'high' : 'normal',
  });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
