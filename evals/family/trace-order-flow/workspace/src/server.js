const http = require('node:http');
const { createOrder } = require('./routes/order');
const { startWorker } = require('./queue/emailWorker');

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/orders') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const result = await createOrder({ body: JSON.parse(raw) });
    res.writeHead(result.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.body));
    return;
  }
  res.writeHead(404);
  res.end();
});

startWorker();
server.listen(3000);
