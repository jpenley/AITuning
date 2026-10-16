// Golden master: the new buildReport must match the original on every seeded input.
const assert = require('assert');
const { buildReport } = require('./report');
const original = require('./test/original-report').buildReport;

let seed = 3;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let k = 0; k < 400; k++) {
  const input = [];
  for (let i = 0; i < 1 + Math.floor(rand() * 50); i++) {
    const u = Math.floor(rand() * 15);
    input.push({ userId: [u, String(u), null][Math.floor(rand() * 3)], email: `u${u}@x`, amount: rand() * 100 });
  }
  const strip = (r) => JSON.stringify({ ...r, generatedAt: 0 });
  assert.strictEqual(strip(buildReport(input)), strip(original(input)));
}
console.log('golden master ok');
