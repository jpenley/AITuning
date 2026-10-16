const rows = [];

function save({ items, chargeId }) {
  const order = { id: rows.length + 1, items, chargeId, createdAt: Date.now() };
  rows.push(order);
  return order;
}

module.exports = { save };
