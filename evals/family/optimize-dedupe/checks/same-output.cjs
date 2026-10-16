// Run from the workspace: exit 0 when buildReport matches the original on every generated input,
// byte for byte (rows in order, keys in order, totals), and leaves its input unmodified.
const path = require('path');
const { buildReport } = require(path.resolve('report.js'));
const ref = require(path.join(__dirname, 'reference.cjs')).buildReport;

let seed = 99;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

function input(n, users) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = Math.floor(rand() * users);
    // Numeric ids arrive as numbers and as strings; '07' is a different user from 7; some rows have no user.
    const id = pick([u, u, String(u), rand() < 0.1 ? '0' + u : u, null, undefined, 900 - u]);
    out.push({ userId: id, email: `u${u}@example.com`, amount: pick([0.1, 0.2, 0.3, 19.99, 1e-7, 1234.5, -5]) * (1 + Math.floor(rand() * 3)) });
  }
  return out;
}

const cases = [[], [{ userId: 3, email: 'x', amount: 1 }]];
for (let k = 0; k < 300; k++) cases.push(input(1 + Math.floor(rand() * 60), 1 + Math.floor(rand() * 20)));
cases.push(input(3000, 800));

const strip = (r) => JSON.stringify({ ...r, generatedAt: undefined });
for (const [i, c] of cases.entries()) {
  const before = JSON.stringify(c);
  let got;
  try {
    got = strip(buildReport(c, i % 2 ? { currency: 'EUR' } : undefined));
  } catch (e) {
    console.error(`case ${i}: threw ${e.message}`);
    process.exit(1);
  }
  if (JSON.stringify(c) !== before) {
    console.error(`case ${i}: buildReport modified its input`);
    process.exit(1);
  }
  const want = strip(ref(JSON.parse(before), i % 2 ? { currency: 'EUR' } : undefined));
  if (got !== want) {
    console.error(`case ${i}: output differs from the original\n got  ${got.slice(0, 300)}\n want ${want.slice(0, 300)}`);
    process.exit(1);
  }
}
console.log(`${cases.length} inputs identical`);
