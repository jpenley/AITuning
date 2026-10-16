const test = require('node:test');
const assert = require('node:assert/strict');
const { requestExport, getExport, DEDUPE_WINDOW_MS } = require('../src/exports');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, what, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(20);
  }
}

test('marks the export complete', async () => {
  const { id } = await requestExport('order-1');

  await waitFor(async () => (await getExport(id)).status === 'done', `export ${id} to be done`);

  assert.equal((await getExport(id)).status, 'done');
});

test('does not start a second job for a duplicate request inside the dedupe window', async () => {
  const first = await requestExport('order-2');
  const second = await requestExport('order-2');

  await waitFor(async () => (await getExport(first.id)).attempts >= 1, `export ${first.id} to start`);
  // Elapsed time is the behaviour here: a duplicate job would start within the window, so let it pass.
  await sleep(DEDUPE_WINDOW_MS);

  assert.equal(second.id, first.id);
  assert.equal((await getExport(first.id)).attempts, 1);
});
