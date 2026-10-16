const http = require('node:http');
const { dispatch } = require('./router');
const routes = require('./routes');

// Adds the small response API the handlers use to a Node response.
function wrap(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.type = (t) => { res.setHeader('content-type', t); return res; };
  res.attachment = (name) => { res.setHeader('content-disposition', `attachment; filename="${name}"`); return res; };
  res.json = (body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); return res; };
  res.send = (body) => { res.end(body); return res; };
  return res;
}

async function readBody(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

const server = http.createServer(async (req, res) => {
  wrap(res);
  const url = new URL(req.url, 'http://localhost');
  req.path = url.pathname;
  req.query = Object.fromEntries(url.searchParams);
  req.user = req.headers['x-user-id'] ? { id: req.headers['x-user-id'], orgIds: String(req.headers['x-user-orgs'] || '').split(',') } : null;
  try {
    req.body = await readBody(req);
    await dispatch(routes, req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).end();
  }
});

if (require.main === module) server.listen(3000);
module.exports = { server };
