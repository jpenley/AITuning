// The request handler the apps call: handle({ method, path, headers, body }) returns { status, body }.
// Clients sign in with an "Authorization: Bearer <token>" header.
const store = require('./store');
const notes = require('./notes');
const { log } = require('./log');

function authenticate(headers) {
  const m = /^Bearer (\S+)$/.exec(headers.authorization ?? '');
  return m ? store.userByToken(m[1]) : null;
}

const routes = [
  ['GET', /^\/notes$/, (user) => notes.list(user)],
  ['POST', /^\/notes$/, (user, req) => notes.create(user, req.body)],
  ['GET', /^\/notes\/(\d+)$/, (user, req, id) => notes.get(user, id)],
  ['POST', /^\/notes\/(\d+)\/share$/, (user, req, id) => notes.share(user, id, req.body.user)],
];

function respond(req) {
  const user = authenticate(req.headers ?? {});
  if (!user) return { status: 401, body: { error: 'sign in first' } };
  for (const [method, pattern, fn] of routes) {
    const m = req.method === method && pattern.exec(req.path);
    if (!m) continue;
    try {
      return { status: 200, body: fn(user, req, m[1] && Number(m[1])) };
    } catch (e) {
      if (e instanceof notes.AccessError) return { status: 404, body: { error: 'not found' } };
      throw e;
    }
  }
  return { status: 404, body: { error: 'no such route' } };
}

function handle(req) {
  const res = respond(req);
  log(`${req.method} ${req.path} ${res.status} ${JSON.stringify(req.headers ?? {})}`);
  return res;
}

module.exports = { handle };
