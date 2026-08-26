// Email delivery. Credentials come from the environment only — in GitHub
// Actions they are repository secrets, locally a .env you keep untracked.

import nodemailer from 'nodemailer';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

let transport;
function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host: required('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: { user: required('SMTP_USER'), pass: required('SMTP_PASS') },
  });
  return transport;
}

const PRIORITY_TAG = { critical: '\u{1F6A8}', high: '\u{1F534}', normal: '\u{1F4E3}', low: '\u2139\uFE0F' };

export async function sendEmail({ subject, lines, priority = 'normal' }) {
  const tag = PRIORITY_TAG[priority] || '';
  const text = lines.join('\n');
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">` +
    lines
      .map((l) => {
        if (l === '') return '<div style="height:10px"></div>';
        if (l.startsWith('# ')) return `<h2 style="margin:0 0 10px;color:#c8102e">${esc(l.slice(2))}</h2>`;
        if (/^https?:\/\//.test(l)) return `<p style="margin:4px 0"><a href="${esc(l)}">${esc(l)}</a></p>`;
        return `<p style="margin:4px 0">${esc(l)}</p>`;
      })
      .join('') +
    `</div>`;

  await getTransport().sendMail({
    from: process.env.MAIL_FROM || required('SMTP_USER'),
    to: required('MAIL_TO'),
    subject: `${tag} ${subject}`.trim(),
    text,
    html,
    priority: priority === 'critical' || priority === 'high' ? 'high' : 'normal',
  });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
