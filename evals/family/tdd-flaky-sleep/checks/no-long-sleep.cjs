// Exit 0 when no completion (non-dedupe) test in test/export.test.js awaits a fixed sleep of a second or
// more: `await sleep(2000)`, `await new Promise((r) => setTimeout(r, 2000))`, `await setTimeout(2000)` from
// node:timers/promises, `2 * 1000`, `2e3`. A polling wait's timeout (`waitFor(..., 5000)`) is not a sleep.
// The dedupe test may keep a fixed sleep: elapsed time is what it tests. A sleep hidden in a helper is
// the timing check's job, which measures it.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { isDedupe, fail } = require('./lib.cjs');

const src = readFileSync(join('test', 'export.test.js'), 'utf8');
const LONG = String.raw`(?:[1-9][\d_]{3,}|\d+(?:\.\d+)?\s*\*\s*1000|\d+(?:\.\d+)?e3)\b`;
const SLEEP = new RegExp(
  String.raw`await\s+(?:[\w.]*(?:sleep|delay|pause|wait(?!For|Until))\w*\s*\(\s*|(?:[\w.]*\.)?setTimeout\s*\(\s*|new\s+Promise\s*\(\s*\(?\s*\w*\s*\)?\s*=>\s*\{?\s*setTimeout\s*\(\s*\w+\s*,\s*)${LONG}`,
  'i',
);

// Split at each test( / it( call; each block runs to the next one.
const starts = [...src.matchAll(/^[ \t]*(?:test|it)(?:\.\w+)?\(\s*(['"`])(.*?)\1/gm)];
if (!starts.length) fail('no tests found in test/export.test.js');
starts.forEach((m, i) => {
  const block = src.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : src.length);
  if (isDedupe(m[2])) return;
  const hit = block.match(SLEEP);
  if (hit) fail(`"${m[2]}" still waits on the clock: ${hit[0]}`);
});
console.log(`no long fixed sleep in: ${starts.map((m) => m[2]).filter((n) => !isDedupe(n)).join('; ')}`);
