// Invoice totals for the billing export. Prices are in dollars; totals are rounded to the cent.
function lineTotal(item) {
  return item.price * item.qty;
}

function invoiceTotal(items, taxRate) {
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  return Math.round((subtotal + tax) * 100) / 100;
}

module.exports = { lineTotal, invoiceTotal };
