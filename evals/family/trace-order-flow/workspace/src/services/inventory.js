const stock = new Map([['sku-1', 10], ['sku-2', 4]]);

function reserve(items) {
  for (const { sku, qty } of items) if ((stock.get(sku) ?? 0) < qty) return false;
  for (const { sku, qty } of items) stock.set(sku, stock.get(sku) - qty);
  return true;
}

function release(items) {
  for (const { sku, qty } of items) stock.set(sku, (stock.get(sku) ?? 0) + qty);
}

module.exports = { reserve, release };
