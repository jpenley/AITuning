const session = require('../auth/session');
const invoices = require('../services/invoices');
const payments = require('../services/payments');

// A customer may only touch their own invoices; an admin may touch any.
function assertCanRead(user, invoice) {
  if (user.role !== 'admin' && invoice.customerId !== user.customerId) throw new session.Forbidden('not your invoice');
}

// GET /invoices  ->  the caller's invoices (all of them for an admin)
function list(req) {
  const user = session.requireAuth(req);
  const all = invoices.list();
  return { status: 200, body: user.role === 'admin' ? all : all.filter((i) => i.customerId === user.customerId) };
}

// GET /invoices/:id
function show(req, params) {
  const user = session.requireAuth(req);
  const invoice = invoices.get(params.id);
  assertCanRead(user, invoice);
  return { status: 200, body: invoice };
}

// POST /invoices  { customerId, lines, dueDate }   (admin)
function create(req) {
  session.requireAdmin(session.requireAuth(req));
  const { customerId, lines, dueDate } = req.body ?? {};
  const invoice = invoices.create(customerId, lines, dueDate);
  return { status: 201, body: invoices.open(invoice.id) };
}

// POST /invoices/:id/pay  { card: { number, exp, cvc } }
async function pay(req, params) {
  const user = session.requireAuth(req);
  assertCanRead(user, invoices.get(params.id));
  return { status: 200, body: await payments.pay(params.id, req.body?.card) };
}

module.exports = { list, show, create, pay };
