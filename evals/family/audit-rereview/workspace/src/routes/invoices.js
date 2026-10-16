const { route } = require('../router');
const { requireAuth, requireOrg } = require('../middleware/auth');
const invoicesRepo = require('../repos/invoicesRepo');

async function listInvoices(req, res) {
  const rows = await invoicesRepo.rowsForOrg(req.org.id, req.query.from, req.query.to);
  res.json(rows);
}

module.exports = [route('GET', '/invoices', requireAuth, requireOrg, listInvoices)];
