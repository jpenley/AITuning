const gateway = require('./gateway');

async function charge(card, amount) {
  const response = await gateway.post('/charges', { card, amount });
  return response.status === 200 ? { ok: true, id: response.body.id } : { ok: false };
}

module.exports = { charge };
