// Invoice rows to CSV for Excel: a header line, then one line per invoice, CRLF line ends.
const HEADER = 'number,customer,total,issued';

// Quotes a field (RFC 4180) and stops Excel reading it as a formula.
function cell(value) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function buildCsv(rows) {
  const lines = rows.map((r) => [r.number, r.customer, r.total.toFixed(2), r.issued].map(cell).join(','));
  return [HEADER, ...lines].join('\r\n');
}

module.exports = { buildCsv };
