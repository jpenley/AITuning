const BASE = process.env.PAYMENT_GATEWAY_URL ?? 'https://gateway.example.test';

async function post(path, payload) {
  const res = await fetch(BASE + path, { method: 'POST', body: JSON.stringify(payload) });
  return { status: res.status, body: await res.json() };
}

module.exports = { post };
