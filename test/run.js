// Replays the situations that matter against saved copies of the real pages.
// Run with: npm test
//
// These cover things that cannot be reproduced on demand — a registration
// window actually opening, a published time moving, the site markup breaking —
// which is exactly where a watcher fails silently if nobody checks.

import { execFileSync } from 'node:child_process';
import { rmSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STATE = join(ROOT, 'state.json');
const SAVED = join(HERE, '.state.snapshot');

let passed = 0;
let failed = 0;

function run({ sub = '', env = {} } = {}) {
  return execFileSync(process.execPath, ['--import', './test/stub.js', 'src/index.js', '--dry-run'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, LFC_TEST_SUB: sub, ...env },
  });
}

function check(name, output, { expect = [], reject = [] }) {
  const missing = expect.filter((s) => !output.includes(s));
  const present = reject.filter((s) => output.includes(s));
  if (missing.length === 0 && present.length === 0) {
    console.log(`  PASS  ${name}`);
    passed++;
    return;
  }
  console.log(`  FAIL  ${name}`);
  for (const m of missing) console.log(`          expected to see: ${m}`);
  for (const p of present) console.log(`          should not have seen: ${p}`);
  failed++;
}

function fresh() {
  rmSync(STATE, { force: true });
}

// --- scenarios -------------------------------------------------------------

console.log('\nAlert logic');

fresh();
check('first run introduces itself rather than alerting on everything', run(), {
  expect: ['LFC ticket watcher started', 'Additional Members Sale Registration: REGISTER SOON'],
  reject: ['Registration announced'],
});
copyFileSync(STATE, SAVED);

check('an unchanged run stays quiet', run(), {
  expect: ['No alerts.'],
});

copyFileSync(SAVED, STATE);
check('registration opening is critical', run({ sub: 'statusIndicator--register-soon=>statusIndicator--register-now|>REGISTER SOON<=>>REGISTER NOW<' }), {
  expect: ['[critical]', 'OPEN NOW', 'This is live right now.'],
});

copyFileSync(SAVED, STATE);
check('a moved sale time is reported', run({ sub: '2026-09-07T11:00=>2026-09-08T09:30' }), {
  expect: ['Time changed', 'Mon 7 September at 11:00 am', 'Tue 8 September at 9:30 am'],
});

copyFileSync(SAVED, STATE);
check('a newly announced registration is reported', run({ sub: 'Additional Members Sale Registration=>Additional Members Sale Registration (Phase 2)' }), {
  expect: ['Registration announced', 'REGISTER SOON'],
});

copyFileSync(SAVED, STATE);
check('a newly announced sale that is not a registration is lower priority', run({ sub: '>Additional Members Sale<=>>Additional Members Sale Extra<' }), {
  expect: ['Sale announced'],
});

console.log('\nBlurb formatting');

copyFileSync(SAVED, STATE);
check('paragraphs are not run together', run({ sub: 'statusIndicator--register-soon=>statusIndicator--register-now' }), {
  reject: ['interest.Registration'],
});

console.log('\nFailure handling');

copyFileSync(SAVED, STATE);
check('unreadable fixture list warns', run({ sub: '/tickets/match/=>/nope/' }), {
  expect: ['may be broken', 'page layout may have changed'],
});

check('and does not then claim all is well', run({ sub: '/tickets/match/=>/nope/' }), {
  expect: ['No alerts.'],
  reject: ['nothing new'],
});

copyFileSync(SAVED, STATE);
check('unparseable sale sections warn', run({ sub: 'ticketing-accordion-list-item=>gone' }), {
  expect: ['may be broken', 'markup has probably changed'],
});

console.log('\nTime zones');

const tz = execFileSync(
  process.execPath,
  [
    '-e',
    `import('./src/time.js').then(({londonToDate}) => {
       console.log('BST', londonToDate('2026-09-01T11:00').toISOString());
       console.log('GMT', londonToDate('2026-12-01T11:00').toISOString());
     });`,
  ],
  { cwd: ROOT, encoding: 'utf8' }
);
check('British Summer Time is an hour ahead of UTC', tz, { expect: ['BST 2026-09-01T10:00:00.000Z'] });
check('GMT matches UTC', tz, { expect: ['GMT 2026-12-01T11:00:00.000Z'] });

// --- done ------------------------------------------------------------------

rmSync(SAVED, { force: true });
fresh();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
