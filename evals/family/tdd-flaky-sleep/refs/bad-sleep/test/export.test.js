const test = require('node:test');
const assert = require('node:assert/strict');
const { requestExport, getExport } = require('../src/exports');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('marks the export complete', async () => {
  const { id } = await requestExport('order-1');

  await sleep(2000);

  assert.equal((await getExport(id)).status, 'done');
});

test('does not start a second job for a duplicate request inside the dedupe window', async () => {
  const first = await requestExport('order-2');
  const second = await requestExport('order-2');

  await sleep(2000);

  assert.equal(second.id, first.id);
  assert.equal((await getExport(first.id)).attempts, 1);
});
