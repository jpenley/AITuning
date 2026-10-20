// All amounts are integer cents in USD.
function toCents(text) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(text).trim());
  if (!match) throw new Error(`not a money amount: ${text}`);
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function formatCents(cents) {
  if (!Number.isInteger(cents)) throw new Error('amount must be integer cents');
  const dollars = Math.trunc(cents / 100);
  const rest = String(Math.abs(cents % 100)).padStart(2, '0');
  return `$${dollars}.${rest}`;
}

function sumCents(values) {
  return values.reduce((total, value) => total + value, 0);
}

module.exports = { toCents, formatCents, sumCents };
