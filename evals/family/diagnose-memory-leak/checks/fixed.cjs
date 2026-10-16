// Runs in the session's workspace: repeated request cycles leave the heap flat and add no reload listeners,
// and the handler still applies a config reload, including one that lands while a request is in flight.
const v8 = require('node:v8');
const vm = require('node:vm');
const { join } = require('node:path');

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const ws = process.cwd();
const config = require(join(ws, 'src', 'config.js'));
const { handleRequest } = require(join(ws, 'src', 'handler.js'));

const fail = (why) => {
  console.error(why);
  process.exit(1);
};
const request = (i) => ({ id: `chk-${i}`, productId: `p-${(i * 7919) % 2000}`, body: JSON.stringify({ i, note: 'y'.repeat(900) }) });
const cycle = async (from, n) => {
  for (let i = from; i < from + n; i++) await handleRequest(request(i));
};
const settle = () => {
  for (let i = 0; i < 4; i++) gc();
  return process.memoryUsage().heapUsed;
};

(async () => {
  const listenersBefore = config.bus.listenerCount('reload');
  await cycle(0, 1000); // warm-up: the cache fills to its limit
  const base = settle();
  for (let c = 1; c <= 5; c++) await cycle(c * 1000, 1000);
  const growth = settle() - base;
  const added = config.bus.listenerCount('reload') - listenersBefore;
  console.log(`heap growth over 5 x 1000 requests: ${(growth / 1048576).toFixed(2)} MB; reload listeners added: ${added}`);
  if (added > 5) fail(`${added} reload listeners left behind by 6000 requests`);
  if (growth > 2 * 1048576) fail('the heap still grows with every cycle');

  const plain = await handleRequest(request(1));
  config.reload({ currency: 'EUR', priceMultiplier: 2 });
  const after = await handleRequest(request(1));
  if (after.currency !== 'EUR' || Math.abs(after.price - plain.price * 2) > 0.01) fail('a reload no longer applies to new requests');
  const inFlight = handleRequest(request(2));
  config.reload({ currency: 'GBP' });
  if ((await inFlight).currency !== 'GBP') fail('a reload during a request no longer applies to the rest of it');
})().catch((e) => fail(e.stack));
