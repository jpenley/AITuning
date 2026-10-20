const session = require('../auth/session');
const customers = require('../services/customers');

// GET /customers   (admin)
function list(req) {
  session.requireAdmin(session.requireAuth(req));
  return { status: 200, body: customers.list() };
}

// POST /customers  { name, email }   (admin)
function create(req) {
  session.requireAdmin(session.requireAuth(req));
  return { status: 201, body: customers.create(req.body ?? {}) };
}

// DELETE /customers/:id   (admin)
function remove(req, params) {
  session.requireAdmin(session.requireAuth(req));
  customers.remove(params.id);
  return { status: 204, body: null };
}

module.exports = { list, create, remove };
