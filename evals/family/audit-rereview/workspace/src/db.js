// A tiny in-memory store seeded from data/<table>.json. Good enough for this service and its tests.
const fs = require('node:fs');
const path = require('node:path');

const tables = {};

function table(name) {
  if (!tables[name]) {
    const file = path.join(__dirname, '..', 'data', `${name}.json`);
    tables[name] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }
  return tables[name];
}

async function all(name) {
  return table(name).slice();
}

async function insert(name, row) {
  table(name).push(row);
  return row;
}

function reset() {
  for (const name of Object.keys(tables)) delete tables[name];
}

module.exports = { all, insert, reset };
