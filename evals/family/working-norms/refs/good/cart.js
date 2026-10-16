// Cart totals.
const fs = require('fs');

const TAX_RATE = 0.08;

function subtotal(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].qty;
  }
  return total;
}

// function oldTotal(items) {
//   return items.reduce((s, i) => s + i.price, 0);
// }

function total(items, discount) {
  const sub = subtotal(items);
  const discounted = sub - discount;
  return Math.round((discounted + discounted * TAX_RATE) * 100) / 100;
}

module.exports = { subtotal, total };
