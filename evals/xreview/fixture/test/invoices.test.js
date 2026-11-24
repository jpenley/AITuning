const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerly-')), 'data.json');
const customers = require('../src/services/customers');
const invoices = require('../src/services/invoices');

test('an invoice needs an existing customer and at least one line', () => {
  assert.throws(() => invoices.create('cus_missing', [{ description: 'x', qty: 1, unitCents: 100 }]));
  const customer = customers.create({ name: 'Acme', email: 'ap@acme.test' });
  assert.throws(() => invoices.create(customer.id, []));
});

test('the total is the sum of the lines in cents', () => {
  const customer = customers.create({ name: 'Beta', email: 'ap@beta.test' });
  const invoice = invoices.create(customer.id, [{ description: 'a', qty: 2, unitCents: 150 }, { description: 'b', qty: 1, unitCents: 25 }]);
  assert.equal(invoice.totalCents, 325);
  assert.equal(invoice.status, 'draft');
});

test('the status moves draft to open to paid, and a paid invoice is final', () => {
  const customer = customers.create({ name: 'Gamma', email: 'ap@gamma.test' });
  const invoice = invoices.create(customer.id, [{ description: 'a', qty: 1, unitCents: 100 }]);
  assert.equal(invoices.open(invoice.id).status, 'open');
  assert.equal(invoices.markPaid(invoice.id, 'ch_1').status, 'paid');
  assert.throws(() => invoices.voidInvoice(invoice.id));
});
