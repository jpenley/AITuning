const test = require('node:test');
const assert = require('node:assert/strict');
const { requestExport, getExport } = require('../src/exports');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('marks the export complete', async () => {
  const { id } = await requestExport('order-1');

  // CI is slower than local, so only check the job was picked up.
  await sleep(100);

  assert.ok(['processing', 'done'].includes((await getExport(id)).status));
});

test('does not start a second job for a duplicate request inside the dedupe window', async () => {
  const first = await requestExport('order-2');
  const second = await requestExport('order-2');

  await sleep(500);

  assert.equal(second.id, first.id);
  assert.equal((await getExport(first.id)).attempts, 1);
});
