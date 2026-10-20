import test from 'node:test';
import assert from 'node:assert/strict';
import { registerElicitation } from '../src/extension.mjs';
import { responseBudgetCase } from './contract-cases.mjs';

function host(answers, provider = 'native') {
  const tools = [], handlers = new Map(), listeners = new Map(), titles = [];
  const pi = { registerTool: t => tools.push(t), registerCommand() {}, getAllTools: () => [],
    on: (e, f) => { handlers.set(e, f); return () => handlers.delete(e); },
    events: { on(e, f) { const set = listeners.get(e) ?? new Set(); listeners.set(e, set); set.add(f); return () => set.delete(f); }, emit(e, p) { for (const f of listeners.get(e) ?? []) f(p); } } };
  registerElicitation(pi, { provider });
  const ctx = { hasUI: true, mode: 'rpc', tools: [], ui: { select: async title => { titles.push(title); const answer = answers.shift(); return typeof answer === 'function' ? answer() : answer; }, input: async title => { titles.push(title); const answer = answers.shift(); return typeof answer === 'function' ? answer() : answer; } } };
  return { tool: tools[0], ctx, titles, pi, handlers };
}
test('queued abort never opens UI and does not release the active lane', async () => {
  let release, opened;
  const ready = new Promise(resolve => { opened = resolve; });
  const h = host([() => { opened(); return new Promise(resolve => { release = resolve; }); }, 'Accept', 'C1: true', 'Decline']);
  const args = request({ x: { type: 'boolean' } });
  const first = h.tool.execute('a', args, undefined, undefined, h.ctx);
  await ready;
  const controller = new AbortController();
  const second = h.tool.execute('b', args, controller.signal, undefined, h.ctx);
  const third = h.tool.execute('c', args, undefined, undefined, h.ctx);
  controller.abort();
  assert.deepEqual((await second).structuredContent, { action: 'cancel' });
  assert.equal(h.titles.length, 1);
  release('C2: false');
  assert.equal((await first).structuredContent.content.x, false);
  assert.equal((await third).structuredContent.action, 'decline');
});

test('session invalidation ignores stale dialog completion', async () => {
  let release, opened;
  const ready = new Promise(resolve => { opened = resolve; });
  const h = host([() => { opened(); return new Promise(resolve => { release = resolve; }); }]);
  const pending = h.tool.execute('p', request({ x: { type: 'boolean' } }), undefined, undefined, h.ctx);
  await ready;
  h.handlers.get('session_before_switch')();
  release('C1: true');
  assert.deepEqual((await pending).structuredContent, { action: 'cancel' });
  assert.equal(h.titles.length, 1);
});

const request = properties => ({ server: 'trusted-server', source: 'test', request: { message: 'Supply values', requestedSchema: { type: 'object', properties, required: Object.keys(properties) } } });

// Break: truthy coercion loses false/0, or collection alone grants consent.
test('registered tool preserves false and zero only after separate consent', async () => {
  const h = host(['C2: false', '0', 'Accept']);
  const result = await h.tool.execute('parent', request({ flag: { type: 'boolean' }, count: { type: 'integer' } }), undefined, undefined, h.ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(result.structuredContent)), { action: 'accept', content: { flag: false, count: 0 } });
  assert.equal(result.details, undefined);
  assert.ok(!JSON.stringify(result.content).includes('false'));
  assert.match(h.titles.at(-1), /trusted-server/);
});

test('defaults are validated but never submitted on dismissal', async () => {
  const h = host([undefined]);
  const result = await h.tool.execute('p', request({ x: { type: 'integer', default: 7 } }), undefined, undefined, h.ctx);
  assert.deepEqual(result.structuredContent, { action: 'cancel' });
});

test('decline differs from final dismissal', async () => {
  for (const [choice, action] of [['Decline', 'decline'], [undefined, 'cancel']]) {
    const h = host(['0', choice]);
    assert.deepEqual((await h.tool.execute('p', request({ x: { type: 'number' } }), undefined, undefined, h.ctx)).structuredContent, { action });
  }
});

test('unsupported schemas and unknown providers fail before opening UI', async () => {
  for (const property of [{ type: 'string', pattern: 'x' }, { type: 'object' }, { type: 'array', items: { type: 'string' } }, { type: 'number', default: '0' }]) {
    const h = host([]);
    await assert.rejects(h.tool.execute('p', request({ x: property }), undefined, undefined, h.ctx));
    assert.equal(h.titles.length, 0);
  }
  const h = host([], 'unknown');
  await assert.rejects(h.tool.execute('p', request({ x: { type: 'boolean' } }), undefined, undefined, h.ctx));
});

test('display escapes control codes without mutating returned values or special keys', async () => {
  const properties = JSON.parse('{"__proto__":{"type":"string","enum":["a\\u001b[31m\\u202eb","other"]}}');
  const h = host(['C1: a\\u001b[31m\\u202eb', 'Accept']);
  const result = await h.tool.execute('p', request(properties), undefined, undefined, h.ctx);
  assert.equal(Object.hasOwn(result.structuredContent.content, '__proto__'), true);
  assert.equal(result.structuredContent.content.__proto__, 'a\u001b[31m\u202eb');
  assert.ok(h.titles.every(t => !/[\u001b\u202e]/u.test(t)));
});

// Break: collector envelope overhead consumes the documented content payload budget.
test('registered tool accepts near-limit content only after final consent', async () => {
  const content = responseBudgetCase.values[0].content;
  const h = host([...Object.values(content), 'Accept']);
  const args = { server: 'size-fixture', source: 'test', request: responseBudgetCase.request };
  const result = await h.tool.execute('size', args, undefined, undefined, h.ctx);
  assert.deepEqual(result.structuredContent, { action: 'accept', content });
  assert.match(h.titles.at(-1), /final consent/u);
});
