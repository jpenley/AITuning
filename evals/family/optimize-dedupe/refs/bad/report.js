// Builds the nightly finance export from raw payment events.
function buildReport(events, opts = {}) {
  const currency = opts.currency || 'USD';
  const byUser = {};
  for (const e of events) {
    const key = String(e.userId);
    if (!byUser[key]) byUser[key] = { userId: e.userId ?? null, email: e.email, amount: 0, count: 0 };
    byUser[key].amount += e.amount;
    byUser[key].count += 1;
  }
  const rows = Object.values(byUser);
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
