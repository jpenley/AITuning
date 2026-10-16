const { route } = require('../router');
const { requireAuth, requireOrg } = require('../middleware/auth');
const exportsRepo = require('../repos/exportsRepo');
const invoicesRepo = require('../repos/invoicesRepo');
const { buildCsv } = require('../services/buildCsv');

async function createExport(req, res) {
  try {
    const rows = await invoicesRepo.rowsForOrg(req.org.id, req.body.from, req.body.to);
    const exp = await exportsRepo.create({ orgId: req.org.id, csv: buildCsv(rows), createdBy: req.user.id });
    res.status(201).json({ id: exp.id });
  } catch (e) {
    res.status(201).json({ id: null });
  }
}

async function downloadExport(req, res) {
  const exp = await exportsRepo.findForOrg(req.org.id, req.params.id);
  if (!exp) return res.status(404).end();
  res.type('text/csv').attachment(`invoices-${exp.id}.csv`).send(exp.csv);
}

module.exports = [
  route('POST', '/exports', requireAuth, requireOrg, createExport),
  route('GET', '/exports/:id/download', requireAuth, requireOrg, downloadExport),
];
