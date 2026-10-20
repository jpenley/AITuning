import assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { bounded, setup, until } from './stock.fixture.mjs';

const options = { concurrency: false, timeout: 30000 };
const serverUrl = 'https://mcp.example.invalid/mcp';
// Literal native disk format, not produced by either implementation's store.
// All identities and tokens are synthetic; discovery is cached to forbid discovery I/O.
const seed = `{
  "mcp__lab_docs|https://mcp.example.invalid/mcp": {
    "serverUrl": "https://mcp.example.invalid/mcp",
    "clientInformation": {
      "client_id": "synthetic-stock-client",
      "redirect_uris": ["http://127.0.0.1/callback"],
      "token_endpoint_auth_method": "none",
      "grant_types": ["authorization_code", "refresh_token"],
      "response_types": ["code"]
    },
    "tokens": {
      "access_token": "synthetic-old-access",
      "token_type": "Bearer",
      "refresh_token": "synthetic-old-refresh",
      "scope": "docs:read"
    },
    "discovery": {
      "authorizationServerUrl": "https://auth.example.invalid",
      "authorizationServerMetadata": {
        "issuer": "https://auth.example.invalid",
        "authorization_endpoint": "https://auth.example.invalid/authorize",
        "token_endpoint": "https://auth.example.invalid/token",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["none"]
      },
      "resourceMetadata": {
        "resource": "https://mcp.example.invalid/mcp",
        "authorization_servers": ["https://auth.example.invalid"]
      }
    }
  }
}`;
const key = 'mcp__lab_docs|https://mcp.example.invalid/mcp';
const authPath = h => join(h.agentDir, 'mcp-auth.json');
const readAuth = async h => JSON.parse(await readFile(authPath(h), 'utf8'));
// Observe rejections immediately, including on a failing setup/order assertion.
const observe = work => work.then(() => ({ ok: true }), error => ({ error }));

async function assertLoggedOut(h) {
  const disk = await readAuth(h);
  assert.equal(Object.hasOwn(disk, key), false, 'logout must not resurrect the native namespaced credential entry');
  assert.equal(Object.hasOwn(disk, serverUrl), false, 'logout must not leave legacy URL credentials');
  assert.equal(await bounded(h.authProvider.token(), 'token read after logout'), undefined,
    'the public transport auth provider must no longer supply a bearer token');
}

// Break caught: deleting credentials before an in-flight refresh saves its rotated
// tokens allows that save to recreate mcp-auth.json state after a successful logout.
// Deliberately mirror-only, even when MIRROR_CONTROL=native: this is a regression,
// not an expected-failure native control or a comparison that blesses the race.
test('mirror logout cannot resurrect credentials when a delayed OAuth refresh finishes after transport close', options, async () => {
  let releaseRefresh;
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
  let refreshRequested = false;
  const fetches = [];
  const mockFetch = async (input, init) => {
    const url = String(input);
    fetches.push(url);
    assert.equal(url, 'https://auth.example.invalid/token', 'only the reserved synthetic token endpoint is permitted');
    assert.equal(init?.method, 'POST');
    const body = new URLSearchParams(init.body);
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('refresh_token'), 'synthetic-old-refresh');
    assert.equal(body.get('client_id'), 'synthetic-stock-client');
    assert.equal(body.get('resource'), serverUrl);
    refreshRequested = true;
    await refreshGate;
    // Never delegate to global/real fetch, even for unexpected requests.
    return Response.json({ access_token: 'synthetic-rotated-access', token_type: 'Bearer',
      refresh_token: 'synthetic-rotated-refresh', expires_in: 3600, scope: 'docs:read' });
  };
  let h, refresh, logout;
  try {
    h = await setup({ factory: 'mirror', httpAuth: true, storedAuth: JSON.parse(seed), mockFetch });
    await h.ready();
    assert.equal(await bounded(h.authProvider.token(), 'seeded token read'), 'synthetic-old-access');
    assert.equal(h.transportState.closed, false);
    // SDK 1.3.0 calls its public recovery hook onUnauthorized, not recover.
    assert.equal(typeof h.authProvider.onUnauthorized, 'function');
    refresh = observe(h.authProvider.onUnauthorized({
      response: new Response(null, { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } }),
      serverUrl: new URL(serverUrl), token: 'synthetic-old-access', fetch: mockFetch,
    }));
    await until(() => refreshRequested, 'real OAuth refresh waiting at the synthetic response gate');
    logout = observe(h.session.prompt('/mcp logout lab-docs'));
    // Do not await logout here: a corrected logout may wait for the refresh lock
    // after disconnecting and delete credentials only once the refresh has settled.
    await until(() => h.transportState.closed, 'actual memory client.close during slash-command logout');
    releaseRefresh();
    const outcomes = await bounded(Promise.all([refresh, logout]), 'refresh and public logout completion');
    for (const outcome of outcomes) assert.ifError(outcome.error);
    assert.deepEqual(fetches, ['https://auth.example.invalid/token'], 'one real refresh, no discovery or provider requests');
    await assertLoggedOut(h);
    assert.deepEqual(h.errors, []);
  } finally {
    // Release before awaiting work or closing: shutdown itself waits for refresh.
    releaseRefresh();
    try {
      await bounded(Promise.all([refresh, logout].filter(Boolean)), 'auth race cleanup');
    } finally {
      if (h) await bounded(h.close(), 'auth fixture close');
    }
  }
});

// Break caught: incompatible file keys/shapes, memoized bearer tokens that ignore
// another process's replacement, or logout that only disconnects without deleting.
test('native and mirror read literal native credentials on demand and normal slash logout removes them', options, async () => {
  for (const factory of ['native', 'mirror']) {
    const h = await setup({ factory, collector: false, httpAuth: true, storedAuth: JSON.parse(seed),
      mockFetch: async input => assert.fail(`unexpected auth network request: ${String(input)}`) });
    try {
      await h.ready();
      const commands = h.api.getCommands().filter(command => command.name === 'mcp');
      assert.equal(commands.length, 1, `${factory}: exactly one public /mcp owner`);
      assert.equal(await bounded(h.authProvider.token(), `${factory} literal token read`), 'synthetic-old-access');
      assert.deepEqual(await readAuth(h), JSON.parse(seed), `${factory}: reading must preserve native state`);
      // Simulate another process replacing the default store, not an injected store
      // or a save through the implementation whose caching we are testing.
      const replacement = seed.replace('synthetic-old-access', 'synthetic-external-access');
      const nextPath = join(h.agentDir, 'mcp-auth.next.json');
      await writeFile(nextPath, replacement, 'utf8');
      await rename(nextPath, authPath(h));
      assert.equal(await bounded(h.authProvider.token(), `${factory} external replacement read`), 'synthetic-external-access');
      await bounded(h.session.prompt('/mcp logout lab-docs'), `${factory} normal public logout`);
      assert.equal(h.transportState.closed, true, `${factory}: logout must close the actual transport`);
      await assertLoggedOut(h);
      assert.deepEqual(h.api.getCommands().filter(command => command.name === 'mcp'), commands,
        `${factory}: logout must preserve public command source identity`);
      assert.deepEqual(h.errors, []);
    } finally { await bounded(h.close(), `${factory} normal auth fixture close`); }
  }
});

// Break caught: deletion from an already-needs-auth server masquerades as a new
// external sign-in and reconnects on the next ordinary model turn.
test('logout replaces an existing needs-auth token snapshot before the next turn', options, async () => {
  const h = await setup({ factory: 'mirror', collector: false, httpAuth: true, storedAuth: JSON.parse(seed), mode: 'rpc' });
  try {
    await h.ready();
    assert.equal((await readAuth(h))[key].tokens.access_token, 'synthetic-old-access');
    let authRequired;
    try {
      await h.authProvider.onUnauthorized({ token: 'synthetic-old-access',
        response: new Response('', { status: 401, headers: { 'www-authenticate': 'Bearer error="insufficient_scope"' } }),
        fetch: async () => assert.fail('insufficient-scope detection cannot fetch'),
      });
    } catch (error) { authRequired = error; }
    assert.equal(authRequired?.name, 'McpOAuthAuthorizationRequiredError');
    h.failTransportWith(authRequired);
    await h.session.prompt('/mcp reconnect lab-docs');
    assert.equal(h.transportState.created, 2);
    const expected = h.notifications.splice(0);
    assert.equal(expected.length, 1);
    assert.equal(expected[0].type, 'error');
    assert.match(expected[0].message, /sign-in/i);
    await h.session.prompt('/mcp');
    const status = h.notifications.pop();
    assert.equal(status.type, 'info');
    assert.match(status.message, /^lab-docs: needs sign-in,/m, 'precondition: reconnect really entered needs-auth');
    await h.session.prompt('/mcp logout lab-docs');
    await assertLoggedOut(h);
    const previousTurns = h.completedTurns.count;
    await h.script(`text('QUAL:' + JSON.stringify(true));`);
    await until(() => h.completedTurns.count > previousTurns, 'MCP turn_start handlers completed');
    assert.equal(h.transportState.created, 2, 'logout deletion is not an external sign-in');
    // A real external replacement after logout still triggers native on-turn reconnect.
    const external = JSON.parse(seed);
    external[key].tokens.access_token = 'synthetic-external-after-logout';
    await writeFile(authPath(h), JSON.stringify(external), 'utf8');
    const beforeSignIn = h.completedTurns.count;
    await h.script(`text('QUAL:' + JSON.stringify(true));`);
    await until(() => h.completedTurns.count > beforeSignIn, 'external sign-in turn handlers completed');
    assert.equal(h.transportState.created, 3, 'a new external grant still reconnects');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
