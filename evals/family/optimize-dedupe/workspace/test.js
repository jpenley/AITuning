const assert = require('assert');
const { buildReport } = require('./report');

const r = buildReport([
  { userId: 1, email: 'a@example.com', amount: 10 },
  { userId: 2, email: 'b@example.com', amount: 5 },
  { userId: 1, email: 'a@example.com', amount: 2.5 },
]);
assert.strictEqual(r.rows.length, 2);
assert.strictEqual(r.currency, 'USD');
console.log('ok');
