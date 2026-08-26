// LFC publishes naive wall-clock times ("2026-09-01T11:00") which are always
// UK local. GitHub Actions runs in UTC, so every comparison has to go through
// Europe/London or we'd be an hour out for most of the season.

const LONDON = 'Europe/London';

function offsetMsAt(utcMs) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value])
  );
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asIfUtc - utcMs;
}

// Naive London wall-clock -> real Date. Two passes settle the DST edge cases.
export function londonToDate(naive) {
  if (!naive) return null;
  const m = String(naive).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi] = m.map(Number);
  const wall = Date.UTC(Y, Mo - 1, D, H, Mi);
  let utc = wall;
  for (let i = 0; i < 2; i++) utc = wall - offsetMsAt(utc);
  return new Date(utc);
}

export function formatLondon(date) {
  if (!date) return 'unknown';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, weekday: 'short', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date);
}

export function humanCountdown(ms) {
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${Math.round(hours / 24)} days`;
}
