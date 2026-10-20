const fs = require('node:fs');
const { DATA_FILE } = require('../config');

const EMPTY = { customers: [], invoices: [], users: [], counters: {} };

function load() {
  if (!fs.existsSync(DATA_FILE)) return structuredClone(EMPTY);
  return { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
}

// Reads the whole file, applies fn to the data, writes the whole file back. All synchronous.
function update(fn) {
  const data = load();
  const result = fn(data);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return result;
}

function nextId(data, kind) {
  data.counters[kind] = (data.counters[kind] ?? 0) + 1;
  return `${kind}_${data.counters[kind]}`;
}

module.exports = { load, update, nextId };
