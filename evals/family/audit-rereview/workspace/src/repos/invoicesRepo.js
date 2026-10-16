const db = require('../db');

// Invoices for one organisation issued between from and to (ISO dates, inclusive; either may be omitted).
async function rowsForOrg(orgId, from, to) {
  try {
    const all = await db.all('invoices');
    return all
      .filter((i) => i.orgId === orgId)
      .filter((i) => (!from || i.issued >= from) && (!to || i.issued <= to))
      .map(({ number, customer, total, issued }) => ({ number, customer, total, issued }));
  } catch (e) {
    return [];
  }
}

module.exports = { rowsForOrg };
