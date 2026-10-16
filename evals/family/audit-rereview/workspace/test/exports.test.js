const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { call, reset } = require('./helpers');

beforeEach(reset);

test('creates an export and downloads it', async () => {
  const created = await call('POST', '/exports', { body: { from: '2026-09-01', to: '2026-09-30' } });
  assert.equal(created.statusCode, 201);
  const res = await call('GET', `/exports/${created.body.id}/download`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/csv');
  assert.match(res.body, /^number,customer,total,issued\r\n"INV-1001",/);
});

test('answers 404 for an unknown export', async () => {
  const res = await call('GET', '/exports/exp-999/download');
  assert.equal(res.statusCode, 404);
});

test('does not serve another organisation its export', async () => {
  const created = await call('POST', '/exports', { body: {} });
  const res = await call('GET', `/exports/${created.body.id}/download`, { org: 'org-b', user: { id: 'u2', orgIds: ['org-b'] } });
  assert.equal(res.statusCode, 404);
});
