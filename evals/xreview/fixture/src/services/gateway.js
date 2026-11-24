// Client for the card payment gateway. The gateway only supports creating charges; there is no refund call here.
let counter = 0;

async function charge({ amountCents, card }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('amount must be positive integer cents');
  if (!card || !/^\d{12,19}$/.test(String(card.number))) throw new Error('invalid card');
  if (String(card.number).endsWith('0000')) throw new Error('card declined');
  counter += 1;
  return { id: `ch_${Date.now()}_${counter}` };
}

module.exports = { charge };
