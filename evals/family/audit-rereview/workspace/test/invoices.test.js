const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { call, reset } = require('./helpers');

beforeEach(reset);

test('lists only the caller organisation invoices', async () => {
  const res = await call('GET', '/invoices');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.map((i) => i.number), ['INV-1001', 'INV-1002']);
});

test('filters by issue date', async () => {
  const res = await call('GET', '/invoices', { query: { from: '2026-09-10' } });
  assert.deepEqual(res.body.map((i) => i.number), ['INV-1002']);
});

test('rejects a caller outside the organisation', async () => {
  const res = await call('GET', '/invoices', { org: 'org-b' });
  assert.equal(res.statusCode, 403);
});
