import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApprovalClient } from '../src/mcp/approval-client.ts';

// Resolve public dependency exports only; never import the Pi SDK or load a profile.
const packageName = '@earendil-works/pi-mcp';
let root = process.env.MCP_CLIENT_ROOT;
if (!root) {
  assert.ok(process.env.SDK_ROOT && isAbsolute(process.env.SDK_ROOT), 'Set SDK_ROOT or MCP_CLIENT_ROOT explicitly');
  const require = createRequire(join(process.env.SDK_ROOT, 'package.json'));
  for (const directory of require.resolve.paths(packageName) ?? []) {
    const candidate = join(directory, packageName);
    try { await readFile(join(candidate, 'package.json')); root = candidate; break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
assert.ok(root && isAbsolute(root), 'An absolute MCP client package root is required');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.equal(manifest.name, packageName);
const publicModule = subpath => import(pathToFileURL(join(root, manifest.exports[subpath].import)).href);
const { McpClient, McpTimeoutError } = await publicModule('.');
const { createInMemoryTransportPair } = await publicModule('./testing');
console.error(`approval-wait fixture: ${packageName}@${manifest.version}`);

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function drain() { for (let i = 0; i < 24; i++) await Promise.resolve(); }
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await Promise.resolve(); }
  assert.fail('In-memory protocol condition did not become true');
}
async function fixture(t, enableTimers = true) {
  let now = 0;
  const Client = createApprovalClient(McpClient, McpTimeoutError, () => now);
  const pair = createInMemoryTransportPair();
  const messages = [];
  pair.server.onMessage(message => {
    messages.push(message);
    if (message.method === 'initialize') void pair.server.send({ jsonrpc: '2.0', id: message.id, result: {
      protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic', version: '1' },
    } });
  });
  await pair.server.start();
  const client = new Client({ name: 'test', version: '1', requestTimeoutMs: 60000 });
  await client.connect(pair.client);
  if (enableTimers) t.mock.timers.enable({ apis: ['setTimeout'] });
  return { client, peer: pair.server, messages, advance: ms => { now += ms; t.mock.timers.tick(ms); } };
}

test('a real MCP tools/call survives two days awaiting human approval without replay', async t => {
  // Break: the outer request timer continues while elicitation waits for a human.
  const h = await fixture(t), answer = deferred(), entered = deferred();
  let status = 'pending';
  h.client.setRequestHandler('elicitation/create', () => h.client.withHumanWait(async () => {
    entered.resolve(); return answer.promise;
  }));
  const result = h.client.callTool('synthetic-approval', {}).then(
    value => { status = 'resolved'; return { value }; }, error => { status = 'rejected'; return { error }; });
  try {
    await until(() => h.messages.some(message => message.method === 'tools/call'));
    const call = h.messages.find(message => message.method === 'tools/call');
    await h.peer.send({ jsonrpc: '2.0', id: 'form', method: 'elicitation/create', params: {} });
    await entered.promise;
    h.advance(172800000); await drain();
    assert.equal(status, 'pending');
    assert.equal(h.messages.some(message => message.method === 'notifications/cancelled'), false);
    answer.resolve({ action: 'accept', content: { consent: true } });
    await until(() => h.messages.some(message => message.id === 'form' && message.result));
    await h.peer.send({ jsonrpc: '2.0', id: call.id, result: { content: [{ type: 'text', text: 'synthetic operation completed' }] } });
    assert.equal((await result).value.content[0].text, 'synthetic operation completed');
    assert.equal(h.messages.filter(message => message.method === 'tools/call').length, 1);
  } finally { answer.resolve({ action: 'cancel' }); await drain(); await h.client.close(); await h.peer.close(); }
});

function start(h, options = {}) {
  const observation = { status: 'pending' };
  observation.result = h.client.callTool('synthetic-work', {}, options).then(
    value => { observation.status = 'resolved'; return { value }; },
    error => { observation.status = 'rejected'; return { error }; });
  return observation;
}

test('ordinary requests still expire at their configured active-time deadline', async t => {
  // Break: disabling the MCP timeout globally to make forms survive.
  const h = await fixture(t);
  try {
    const call = start(h);
    h.advance(59999); await drain(); assert.equal(call.status, 'pending');
    h.advance(1); await drain();
    assert.ok((await call.result).error instanceof McpTimeoutError);
    assert.equal(h.messages.filter(message => message.method === 'tools/call').length, 1);
    assert.equal(h.messages.filter(message => message.method === 'notifications/cancelled').length, 1);
  } finally { await h.client.close(); await h.peer.close(); }
});

test('approval waiting pauses rather than resets the remaining active budget', async t => {
  // Break: giving an operation a fresh timeout after each form instead of excluding only human wait.
  const h = await fixture(t), answer = deferred();
  try {
    const call = start(h); h.advance(10000);
    const waiting = h.client.withHumanWait(() => answer.promise);
    h.advance(172800000); await drain(); assert.equal(call.status, 'pending');
    answer.resolve(); await waiting;
    h.advance(49999); await drain(); assert.equal(call.status, 'pending');
    h.advance(1); await drain(); assert.ok((await call.result).error instanceof McpTimeoutError);
  } finally { answer.resolve(); await h.client.close(); await h.peer.close(); }
});

test('explicit cancellation remains effective throughout a human wait', async t => {
  // Break: pausing the abort signal along with the machine deadline.
  const h = await fixture(t), answer = deferred(), controller = new AbortController();
  try {
    const call = start(h, { signal: controller.signal });
    const waiting = h.client.withHumanWait(() => answer.promise);
    h.advance(172800000); controller.abort(); await drain();
    const result = await call.result;
    assert.equal(result.error.name, 'AbortError');
    assert.equal(result.error instanceof McpTimeoutError, false);
    answer.resolve(); await waiting; h.advance(60000); await drain();
    assert.equal(h.messages.filter(message => message.method === 'notifications/cancelled').length, 1);
  } finally { answer.resolve(); await h.client.close(); await h.peer.close(); }
});

test('progress renews the deadline outside and during a human wait', async t => {
  // Break: losing native progress timeout renewal when replacing the inner timer.
  const h = await fixture(t), answer = deferred();
  let progress = 0;
  try {
    const call = start(h, { onProgress: () => { progress++; } });
    await until(() => h.messages.some(message => message.method === 'tools/call'));
    const request = h.messages.find(message => message.method === 'tools/call');
    const notify = async n => { await h.peer.send({ jsonrpc: '2.0', method: 'notifications/progress',
      params: { progressToken: request.params._meta.progressToken, progress: n } }); await drain(); };
    h.advance(40000); await notify(1);
    h.advance(40000); await drain(); assert.equal(call.status, 'pending');
    const waiting = h.client.withHumanWait(() => answer.promise);
    h.advance(172800000); await notify(2);
    answer.resolve(); await waiting;
    h.advance(59999); await drain(); assert.equal(call.status, 'pending');
    h.advance(1); await drain(); assert.ok((await call.result).error instanceof McpTimeoutError);
    assert.equal(progress, 2);
  } finally { answer.resolve(); await h.client.close(); await h.peer.close(); }
});

test('nested wait completion cannot resume a deadline while another form is pending', async t => {
  // Break: a boolean pause flag loses nested human waits.
  const h = await fixture(t), first = deferred(), second = deferred();
  try {
    const call = start(h);
    const a = h.client.withHumanWait(() => first.promise);
    const b = h.client.withHumanWait(() => second.promise);
    first.resolve(); await a;
    h.advance(172800000); await drain(); assert.equal(call.status, 'pending');
    second.resolve(); await b;
    h.advance(60000); await drain(); assert.ok((await call.result).error instanceof McpTimeoutError);
  } finally { first.resolve(); second.resolve(); await h.client.close(); await h.peer.close(); }
});

test('a failed collector resumes the ordinary operation deadline', async t => {
  // Break: an exception leaves a client permanently unbounded.
  const h = await fixture(t);
  try {
    const call = start(h);
    await assert.rejects(h.client.withHumanWait(async () => { throw new Error('Synthetic collector failure'); }));
    h.advance(60000); await drain(); assert.ok((await call.result).error instanceof McpTimeoutError);
  } finally { await h.client.close(); await h.peer.close(); }
});

test('connection closure still rejects a request while the human is away', async t => {
  // Break: a paused deadline conceals connection shutdown or revives after close.
  const h = await fixture(t), answer = deferred();
  try {
    const call = start(h);
    const waiting = h.client.withHumanWait(() => answer.promise);
    await h.client.close(); await drain();
    assert.equal((await call.result).error.name, 'McpConnectionClosedError');
    answer.resolve(); await waiting; h.advance(172800000); await drain();
    assert.equal(call.status, 'rejected');
  } finally { answer.resolve(); await h.client.close(); await h.peer.close(); }
});

test('explicit upstream no-timeout options retain their public SDK meaning', async t => {
  // Break: altering SDK compatibility rather than replacing only positive deadlines.
  const h = await fixture(t);
  try {
    const call = start(h, { timeoutMs: 0 });
    h.advance(172800000); await drain(); assert.equal(call.status, 'pending');
    await h.client.close(); assert.equal((await call.result).error.name, 'McpConnectionClosedError');
  } finally { await h.client.close(); await h.peer.close(); }
});

test('waiting on one connection does not suspend another connection deadline', async t => {
  // Break: sharing a global pause across MCP servers/connections.
  const first = await fixture(t), second = await fixture(t, false), answer = deferred();
  try {
    const held = start(first), ordinary = start(second);
    const waiting = first.client.withHumanWait(() => answer.promise);
    first.advance(172800000); await drain();
    assert.equal(held.status, 'pending');
    assert.ok((await ordinary.result).error instanceof McpTimeoutError);
    answer.resolve(); await waiting;
    await first.client.close(); assert.equal((await held.result).error.name, 'McpConnectionClosedError');
  } finally { answer.resolve(); await first.client.close(); await first.peer.close(); await second.client.close(); await second.peer.close(); }
});

test('per-request timeout overrides retain their own active budget', async t => {
  // Break: using the connection default for every request.
  const h = await fixture(t);
  try {
    const call = start(h, { timeoutMs: 250 });
    h.advance(249); await drain(); assert.equal(call.status, 'pending');
    h.advance(1); await drain();
    const result = await call.result;
    assert.ok(result.error instanceof McpTimeoutError);
    assert.equal(result.error.timeoutMs, 250);
  } finally { await h.client.close(); await h.peer.close(); }
});
