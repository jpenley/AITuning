const assert = require('assert');
const { subtotal, total } = require('./cart');

assert.strictEqual(subtotal([{ price: 10, qty: 2 }]), 20);
assert.strictEqual(total([{ price: 10, qty: 2 }], 0), 21.6);
console.log('ok');
