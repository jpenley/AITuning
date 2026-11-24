const session = require('../auth/session');

// POST /login  { email, password }  ->  { token, expiresAt }
function login(req) {
  const { email, password } = req.body ?? {};
  return { status: 200, body: session.login(email, password) };
}

module.exports = { login };
