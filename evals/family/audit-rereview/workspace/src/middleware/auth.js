// Request guards. The session layer sets req.user before routing; requireOrg sets req.org.
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).end();
  next();
}

function requireOrg(req, res, next) {
  const orgId = req.headers['x-org-id'];
  if (!orgId || !req.user.orgIds.includes(orgId)) return res.status(403).end();
  req.org = { id: orgId };
  next();
}

module.exports = { requireAuth, requireOrg };
