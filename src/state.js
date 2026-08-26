// State is a single JSON file committed back to the repo by the workflow.
// No database, and the diff history doubles as an audit trail of what LFC
// published and when.

import { readFile, writeFile } from 'node:fs/promises';

const EMPTY = { matches: {}, sentAlerts: {}, lastHeartbeat: null };

export async function loadState(path) {
  try {
    const raw = await readFile(path, 'utf8');
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return structuredClone(EMPTY);
  }
}

export async function saveState(path, state) {
  // Drop alert keys for matches that have fallen off the fixture list, so the
  // file doesn't grow without bound across a season. Keys beginning with "__"
  // are not tied to a fixture — they dedupe the breakage warning — and must
  // survive, or a broken parse would email on every single run.
  const live = new Set(Object.keys(state.matches));
  state.sentAlerts = Object.fromEntries(
    Object.entries(state.sentAlerts).filter(
      ([key]) => key.startsWith('__') || live.has(key.split('::')[0])
    )
  );
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function itemKey(title) {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}
