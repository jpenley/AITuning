// Run from the workspace: exit 0 when tax is charged on the discounted amount.
const { total } = require(require('path').resolve('cart.js'));
const got = total([{ price: 100, qty: 1 }], 20);
if (got !== 86.4) {
  console.error(`total([100 x1], discount 20) = ${got}, want 86.4`);
  process.exit(1);
}
