// Runs the tests: node test/run.js [--all] [word]
// The fast tests are test/*.test.js; --all adds the slow ones in test/slow/. A word keeps only the
// files whose name contains it.
const { readdirSync } = require('fs');
const { spawnSync } = require('child_process');
const { join } = require('path');

const args = process.argv.slice(2);
const word = args.find((a) => !a.startsWith('--')) ?? '';
const dirs = [__dirname, ...(args.includes('--all') ? [join(__dirname, 'slow')] : [])];
const files = dirs.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith('.test.js') && f.includes(word))
    .sort()
    .map((f) => join(d, f)),
);

let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(`${files.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
