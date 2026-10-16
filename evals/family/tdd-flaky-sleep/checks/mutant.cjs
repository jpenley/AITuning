// Exit 0 when the test file catches the planted fault named on the command line:
//   dedupe     a duplicate request gets the first job's id but re-runs the job one poll after it starts
//              (attempts goes 1, then 2). Only a test that lets the dedupe window elapse after the first
//              job starts can see it; a wait that passes as soon as attempts is 1 cannot.
//   never-done the export never finishes. A test that still asserts 'done' must fail.
// Both run against a copy of the workspace with src/exports.js replaced.
const { join } = require('node:path');
const { runTests, withMutant, fail } = require('./lib.cjs');

const which = process.argv[2];
const mutants = { dedupe: 'mutant-dedupe.js', 'never-done': 'mutant-never-done.js' };
if (!mutants[which]) fail(`usage: mutant.cjs <${Object.keys(mutants).join('|')}>`);

const r = withMutant(join(__dirname, mutants[which]), (dir) => runTests({ cwd: dir, jobMs: 30, timeoutMs: 3_000 }));
const failed = r.tests.filter((t) => !t.pass);
if (r.code === 0 && !failed.length) fail(`the tests pass with the ${which} fault planted: ${r.tests.map((t) => t.name).join('; ')}`);
console.log(`${which} fault caught: ${failed.map((t) => t.name).join('; ') || `exit ${r.code}`}`);
