// Builds the nightly finance export from raw payment events.
function dedupe(events) {
  const rows = [];
  const at = new Map();
  for (const e of events) {
    if (e.userId == null) {
      rows.push({ userId: null, email: e.email, amount: e.amount, count: 1 });
      continue;
    }
    const key = String(e.userId);
    const i = at.get(key);
    if (i === undefined) {
      at.set(key, rows.length);
      rows.push({ userId: e.userId, email: e.email, amount: e.amount, count: 1 });
    } else {
      rows[i].amount += e.amount;
      rows[i].count += 1;
    }
  }
  return rows;
}

function buildReport(events, opts = {}) {
  const currency = opts.currency || 'USD';
  const rows = dedupe(events);
  let total = 0;
  for (const r of rows) total += r.amount;
  return {
    generatedAt: new Date().toISOString(),
    currency,
    rows: rows.map((r) => ({ ...r, amount: Math.round(r.amount * 100) / 100 })),
    total: Math.round(total * 100) / 100,
  };
}

module.exports = { buildReport, dedupe };
