// Runs in the session's workspace: the cent-short invoice is right and an exact one is unchanged.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { invoiceTotal } = require(join(process.cwd(), 'src', 'invoice.js'));

assert.equal(invoiceTotal([{ price: 19.99, qty: 1 }], 0.0825), 21.64);
assert.equal(invoiceTotal([{ price: 10, qty: 2 }, { price: 5, qty: 1 }], 0.0825), 27.06);
assert.equal(invoiceTotal([{ price: 3.5, qty: 3 }], 0.07), 11.24);
