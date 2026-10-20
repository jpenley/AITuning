const http = require('node:http');
const { PORT } = require('./config');
const session = require('./auth/session');
const customers = require('./services/customers');
const authRoutes = require('./routes/auth');
const invoiceRoutes = require('./routes/invoices');
const customerRoutes = require('./routes/customers');
const adminRoutes = require('./routes/admin');
const reminders = require('./jobs/reminders');

const ROUTES = [
  ['POST', /^\/login$/, authRoutes.login],
  ['GET', /^\/invoices$/, invoiceRoutes.list],
  ['POST', /^\/invoices$/, invoiceRoutes.create],
  ['GET', /^\/invoices\/(?<id>[\w-]+)$/, invoiceRoutes.show],
  ['POST', /^\/invoices\/(?<id>[\w-]+)\/pay$/, invoiceRoutes.pay],
  ['GET', /^\/customers$/, customerRoutes.list],
  ['POST', /^\/customers$/, customerRoutes.create],
  ['DELETE', /^\/customers\/(?<id>[\w-]+)$/, customerRoutes.remove],
  ['POST', /^\/admin\/invoices\/(?<id>[\w-]+)\/void$/, adminRoutes.voidInvoice],
  ['POST', /^\/admin\/users\/(?<id>[\w-]+)\/role$/, adminRoutes.setRole],
];

function statusFor(error) {
  if (error instanceof session.Unauthorized) return 401;
  if (error instanceof session.Forbidden) return 403;
  if (error instanceof customers.NotFound) return 404;
  return 400;
}

const server = http.createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0];
    const route = ROUTES.map(([method, pattern, handler]) => (req.method === method ? [pattern.exec(path), handler] : null)).find((r) => r?.[0]);
    if (!route) { res.writeHead(404); res.end(); return; }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.body = raw ? JSON.parse(raw) : undefined;
    const result = await route[1](req, route[0].groups ?? {});
    res.writeHead(result.status, { 'content-type': 'application/json' });
    res.end(result.body === null ? '' : JSON.stringify(result.body));
  } catch (error) {
    res.writeHead(statusFor(error), { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

reminders.start();
server.listen(PORT);
