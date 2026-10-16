// Builds the nightly finance export from raw payment events.
function buildReport(events, opts = {}) {
  const currency = opts.currency || 'USD';
  const rows = [];
  for (const e of events) {
    if (e.userId == null) {
      rows.push({ userId: null, email: e.email, amount: e.amount, count: 1 });
      continue;
    }
    const i = rows.findIndex((r) => r.userId !== null && String(r.userId) === String(e.userId));
    if (i === -1) {
      rows.push({ userId: e.userId, email: e.email, amount: e.amount, count: 1 });
    } else {
      rows[i].amount += e.amount;
      rows[i].count += 1;
    }
  }
  let total = 0;
  for (const r of rows) total += r.amount;
  return {
    generatedAt: new Date().toISOString(),
    currency,
    rows: rows.map((r) => ({ ...r, amount: Math.round(r.amount * 100) / 100 })),
    total: Math.round(total * 100) / 100,
  };
}

module.exports = { buildReport };
