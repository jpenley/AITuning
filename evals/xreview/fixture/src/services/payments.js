const invoices = require('./invoices');
const gateway = require('./gateway');

// Charges the card, then marks the invoice paid.
async function pay(invoiceId, card) {
  const invoice = invoices.get(invoiceId);
  if (invoice.status !== 'open') throw new Error(`invoice ${invoiceId} is ${invoice.status}, not open`);
  const charge = await gateway.charge({ amountCents: invoice.totalCents, card });
  return invoices.markPaid(invoiceId, charge.id);
}

module.exports = { pay };
