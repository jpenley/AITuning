// Times buildReport on a synthetic export. Usage: node bench.js [events]
const { buildReport } = require('./report');

function events(n) {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = Math.floor(rand() * (n / 2));
    out.push({ userId: rand() < 0.02 ? null : rand() < 0.5 ? u : String(u), email: `u${u}@example.com`, amount: Math.round(rand() * 10000) / 100 });
  }
  return out;
}

const n = Number(process.argv[2] || 50000);
const input = events(n);
const t = process.hrtime.bigint();
const r = buildReport(input);
const ms = Number(process.hrtime.bigint() - t) / 1e6;
console.log(`${n} events -> ${r.rows.length} rows in ${ms.toFixed(1)} ms`);
