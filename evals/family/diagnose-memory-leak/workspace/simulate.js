// Replays N simulated requests through the handler in-process: node simulate.js [N]
const { handleRequest } = require('./src/handler');

const request = (i) => ({
  id: `req-${i}`,
  productId: `p-${(i * 7919) % 2000}`,
  body: JSON.stringify({ i, note: 'x'.repeat(900) }),
});

async function run(n, from = 0) {
  for (let i = from; i < from + n; i++) await handleRequest(request(i));
}

if (require.main === module) {
  const n = Number(process.argv[2] ?? 1000);
  const started = Date.now();
  run(n).then(() => console.log(`handled ${n} requests in ${Date.now() - started} ms`));
}

module.exports = { request, run };
