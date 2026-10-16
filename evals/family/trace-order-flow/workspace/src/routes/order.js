const inventory = require('../services/inventory');
const payment = require('../services/payment');
const orders = require('../db/orders');
const emailQueue = require('../queue/emailQueue');

function total(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

async function createOrder(req) {
  const { items, card, email } = req.body;
  if (!inventory.reserve(items)) return { status: 409, body: { error: 'out of stock' } };
  const charge = await payment.charge(card, total(items));
  if (!charge.ok) {
    inventory.release(items);
    return { status: 402, body: { error: 'payment failed' } };
  }
  const order = orders.save({ items, chargeId: charge.id });
  emailQueue.enqueue({ to: email, orderId: order.id });
  return { status: 201, body: order };
}

module.exports = { createOrder };
