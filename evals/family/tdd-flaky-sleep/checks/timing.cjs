// Exit 0 when the test file passes on a slow runner and a fast one, and the completion test finishes
// soon after a fast export does. A longer fixed sleep passes the slow run but keeps the fast run waiting;
// the 500 ms sleep it started with fails the slow run.
const { runTests, isDedupe, fail } = require('./lib.cjs');

const SLOW_MS = 1000; // slower than the original 500 ms sleep, well inside any sane wait timeout
const FAST_MS = 30;
const FAST_LIMIT_MS = 1500; // a 50 ms poll plus a 30 ms export, with room for a loaded machine; a 2 s sleep can't make it

for (const [label, jobMs] of [['slow', SLOW_MS], ['fast', FAST_MS], ['fast again', FAST_MS]]) {
  const r = runTests({ jobMs });
  const failed = r.tests.filter((t) => !t.pass).map((t) => t.name);
  if (r.code !== 0 || failed.length) fail(`${label} run (export ${jobMs} ms): tests failed (exit ${r.code}): ${failed.join('; ') || r.stderr.slice(-500)}`);
  const completion = r.tests.filter((t) => !isDedupe(t.name));
  const dedupe = r.tests.filter((t) => isDedupe(t.name));
  if (!completion.length) fail(`${label} run: no completion test found (tests: ${r.tests.map((t) => t.name).join('; ')})`);
  if (!dedupe.length) fail(`${label} run: no dedupe test found (tests: ${r.tests.map((t) => t.name).join('; ')})`);
  if (jobMs === FAST_MS) {
    for (const t of completion) {
      if (t.ms > FAST_LIMIT_MS) fail(`${label} run: "${t.name}" took ${Math.round(t.ms)} ms with a ${FAST_MS} ms export (limit ${FAST_LIMIT_MS} ms): it waits on the clock, not the export`);
    }
  }
  console.log(`${label}: ${r.tests.map((t) => `${t.name} ${Math.round(t.ms)} ms`).join(', ')}`);
}
