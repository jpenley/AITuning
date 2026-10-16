// Route tables: route(method, pattern, ...guards, handler). A guard calls next() to continue.
function route(method, pattern, ...stack) {
  return { method, pattern, stack };
}

function match(pattern, path) {
  const want = pattern.split('/');
  const got = path.split('/');
  if (want.length !== got.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(got[i]);
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

async function dispatch(routes, req, res) {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const params = match(r.pattern, req.path);
    if (!params) continue;
    req.params = params;
    for (const fn of r.stack) {
      let next = false;
      await fn(req, res, () => { next = true; });
      if (!next) return;
    }
    return;
  }
  res.status(404).end();
}

module.exports = { route, dispatch };
