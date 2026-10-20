const store = require('../db/store');
const customers = require('./customers');
const { sumCents } = require('../util/money');

const ALLOWED = { draft: ['open'], open: ['paid', 'void'], paid: [], void: [] };

function transition(invoice, to) {
  if (!ALLOWED[invoice.status]?.includes(to)) throw new Error(`cannot move an invoice from ${invoice.status} to ${to}`);
  invoice.status = to;
}

function create(customerId, lines, dueDate) {
  customers.get(customerId); // throws if the customer does not exist
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('an invoice needs at least one line');
  for (const line of lines) {
    if (!line.description || !Number.isInteger(line.qty) || line.qty < 1 || !Number.isInteger(line.unitCents) || line.unitCents < 0) {
      throw new Error('each line needs a description, a whole quantity and unitCents');
    }
  }
  return store.update((data) => {
    const invoice = {
      id: store.nextId(data, 'inv'),
      customerId,
      lines,
      totalCents: sumCents(lines.map((l) => l.qty * l.unitCents)),
      dueDate: dueDate ?? null,
      status: 'draft',
      createdAt: Date.now(),
    };
    data.invoices.push(invoice);
    return invoice;
  });
}

// Every invoice, oldest first by creation time.
function list() {
  return store.load().invoices.sort((a, b) => a.createdAt - b.createdAt);
}

function get(id) {
  const invoice = store.load().invoices.find((i) => i.id === id);
  if (!invoice) throw new customers.NotFound(`no invoice ${id}`);
  return invoice;
}

function change(id, fn) {
  return store.update((data) => {
    const invoice = data.invoices.find((i) => i.id === id);
    if (!invoice) throw new customers.NotFound(`no invoice ${id}`);
    fn(invoice);
    return invoice;
  });
}

const open = (id) => change(id, (inv) => transition(inv, 'open'));
const markPaid = (id, chargeId) => change(id, (inv) => { transition(inv, 'paid'); inv.chargeId = chargeId; });
const voidInvoice = (id) => change(id, (inv) => transition(inv, 'void'));

module.exports = { create, list, get, open, markPaid, voidInvoice, transition, ALLOWED };
