const db = require('../db');

let nextId = 1;

async function create({ orgId, csv, createdBy }) {
  return db.insert('exports', { id: `exp-${nextId++}`, orgId, csv, createdBy, createdAt: new Date().toISOString() });
}

async function findForOrg(orgId, id) {
  return (await db.all('exports')).find((e) => e.id === id && e.orgId === orgId) ?? null;
}

module.exports = { create, findForOrg };
