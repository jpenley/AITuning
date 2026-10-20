const session = require('../auth/session');
const invoices = require('../services/invoices');
const store = require('../db/store');

// POST /admin/invoices/:id/void   (admin)
function voidInvoice(req, params) {
  session.requireAdmin(session.requireAuth(req));
  return { status: 200, body: invoices.voidInvoice(params.id) };
}

// POST /admin/users/:id/role  { role }   (admin)
function setRole(req, params) {
  session.requireAdmin(session.requireAuth(req));
  const role = req.body?.role;
  if (!['admin', 'customer'].includes(role)) throw new Error('role must be admin or customer');
  return {
    status: 200,
    body: store.update((data) => {
      const user = data.users.find((u) => u.id === params.id);
      if (!user) throw new Error(`no user ${params.id}`);
      user.role = role;
      return { id: user.id, role: user.role };
    }),
  };
}

module.exports = { voidInvoice, setRole };
