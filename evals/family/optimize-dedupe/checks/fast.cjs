// Run from the workspace: exit 0 when buildReport handles 50k events well under the original's time.
// The original is quadratic (seconds); a linear version takes a few milliseconds. The bar is loose on purpose.
const path = require('path');
const { buildReport } = require(path.resolve('report.js'));

let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const events = [];
for (let i = 0; i < 50000; i++) {
  const u = Math.floor(rand() * 25000);
  events.push({ userId: rand() < 0.02 ? null : rand() < 0.5 ? u : String(u), email: `u${u}@example.com`, amount: Math.round(rand() * 10000) / 100 });
}
buildReport(events.slice(0, 500));
const best = Math.min(...[0, 1, 2].map(() => {
  const t = process.hrtime.bigint();
  buildReport(events);
  return Number(process.hrtime.bigint() - t) / 1e6;
}));
if (best > 100) {
  console.error(`50000 events took ${best.toFixed(1)} ms, want under 100 ms`);
  process.exit(1);
}
console.log(`50000 events in ${best.toFixed(1)} ms`);
