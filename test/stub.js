// Serves saved copies of the LFC pages instead of hitting the network, so the
// alert logic can be exercised against situations we cannot reproduce on
// demand — a registration window actually opening, a time being moved.
//
// Load it ahead of the program:
//   node --import ./test/stub.js src/index.js --dry-run
//
// LFC_TEST_SUB applies find/replace pairs to the served HTML:
//   LFC_TEST_SUB="register-soon=>register-now|REGISTER SOON=>REGISTER NOW"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

const subs = (process.env.LFC_TEST_SUB || '')
  .split('|')
  .filter(Boolean)
  .map((pair) => {
    const [from, to] = pair.split('=>');
    return { from, to: to ?? '' };
  });

function apply(html) {
  return subs.reduce((acc, { from, to }) => acc.split(from).join(to), html);
}

function fixtureFor(url) {
  if (/\/tickets\/match\/liverpool-v-fulham/.test(url)) return 'fulham.html';
  if (/\/tickets\/match\/liverpool-v-manchester-city/.test(url)) return 'mancity.html';
  // Every other match page reuses the Man City fixture: it has no Additional
  // Members Sale, which is the correct "nothing announced yet" baseline.
  if (/\/tickets\/match\//.test(url)) return 'mancity.html';
  if (/\/tickets\/?$/.test(url)) return 'tickets.html';
  throw new Error(`No fixture for ${url}`);
}

globalThis.fetch = async (url) => {
  const html = apply(readFileSync(join(FIXTURES, fixtureFor(String(url))), 'utf8'));
  return {
    ok: true,
    status: 200,
    text: async () => html,
  };
};

console.log(`[stub] serving fixtures${subs.length ? ` with ${subs.length} substitution(s)` : ''}`);
