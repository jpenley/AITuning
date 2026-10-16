// Prints one CSV line per invoice in orders.json: id, total.
const { invoiceTotal } = require('./src/invoice.js');
const orders = require('./orders.json');

for (const o of orders) console.log(`${o.id},${invoiceTotal(o.items, o.taxRate).toFixed(2)}`);
