const db = require('../src/db');
const { dispatch } = require('../src/router');
const routes = require('../src/routes');

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.type = (t) => { res.headers['content-type'] = t; return res; };
  res.attachment = (name) => { res.headers['content-disposition'] = `attachment; filename="${name}"`; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.send = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
}

// Sends one request through the real route table as a member of org (or as nobody when user is null).
async function call(method, path, { org = 'org-a', user = { id: 'u1', orgIds: ['org-a'] }, body = {}, query = {} } = {}) {
  const req = { method, path, headers: org ? { 'x-org-id': org } : {}, user, body, query };
  const res = fakeRes();
  await dispatch(routes, req, res);
  return res;
}

module.exports = { call, reset: db.reset };
