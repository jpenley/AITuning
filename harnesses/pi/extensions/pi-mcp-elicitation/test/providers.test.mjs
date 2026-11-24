import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../src/form.mjs';
import { decodeRpiv, rpivPlan, rpivCollect, knownRpiv } from '../src/providers.mjs';
import { registerElicitationAdapter, discoverAdapters } from '../src/adapters.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const parse = (properties, required = Object.keys(properties)) => parseRequest({ server: 's', source: 'src', request: { message: 'm', requestedSchema: { type: 'object', properties, required } } });
const bool = { type: 'boolean' };
const choice = { type: 'string', enum: ['one', 'two'] };
function bus() { const events = new Map(); return { on(e, f) { const s = events.get(e) ?? new Set(); events.set(e, s); s.add(f); return () => s.delete(f); }, emit(e, p) { for (const f of events.get(e) ?? []) f(p); } }; }

test('RPIV preflight only maps representable forms, including explicit omit', () => {
  assert.equal(rpivPlan(parse({ x: { type: 'number' } })), undefined);
  assert.equal(rpivPlan(parse({ x: { type: 'string' } })), undefined);
  assert.equal(rpivPlan(parse({ x: { type: 'array', items: choice } }, [])), undefined);
  assert.equal(rpivPlan(parse({ a: bool, b: bool, c: bool, d: bool, e: bool })), undefined);
  assert.equal(rpivPlan(parse({ x: { type: 'string', enum: ['a', 'b', 'c', 'd'] } }, [])), undefined);
  const plan = rpivPlan(parse({ x: bool }, []));
  assert.deepEqual(plan.questions[0].options.map(o => o.label), ['C1', 'C2', 'C3']);
  const result = decodeRpiv(plan, { isError: false, result: { details: { cancelled: false, answers: [{ questionIndex: 0, question: plan.questions[0].question, kind: 'option', answer: 'C3' }], globalNote: 'ignore me' } } });
  assert.deepEqual(Object.keys(result.content), []);
});

test('malformed, custom, duplicate, partial, gated and error results never accept', () => {
  const plan = rpivPlan(parse({ x: bool }));
  const good = { questionIndex: 0, question: plan.questions[0].question, kind: 'option', answer: 'C2' };
  const wrap = details => ({ isError: false, result: { details } });
  assert.equal(decodeRpiv(plan, wrap({ cancelled: false, answers: [good] })).content.x, false);
  for (const details of [
    { cancelled: false, answers: [] }, { cancelled: false, answers: [good], unanswered: [0] },
    { cancelled: false, answers: [good, good] }, { cancelled: false, answers: [{ ...good, answer: 'false' }] },
    { cancelled: false, answers: [{ ...good, kind: 'custom', answer: 'C1' }] },
    { cancelled: false, answers: [{ ...good, questionIndex: -1 }] },
    { cancelled: true, answers: [], error: 'no_ui' },
  ]) assert.throws(() => decodeRpiv(plan, wrap(details)));
  assert.throws(() => decodeRpiv(plan, { isError: true }));
  assert.deepEqual(decodeRpiv(plan, wrap({ cancelled: true, answers: [] })), { cancelled: true });
});

test('RPIV abort targets only exact nested call IDs and waits for cleanup', async () => {
  const events = bus(), controller = new AbortController();
  let close, emitted;
  events.on('rpiv:ask-user:answer', p => { emitted = p; close({ isError: false, result: { details: { cancelled: true, answers: [] } } }); });
  const pending = rpivCollect({ pi: { events }, signal: controller.signal, callId: 'parent', plan: rpivPlan(parse({ x: bool })), ctx: { executeTool: () => new Promise(resolve => { close = resolve; }) } });
  events.emit('rpiv:ask-user:prompt', { toolCallId: 'parent/1/1' });
  events.emit('rpiv:ask-user:prompt', { toolCallId: 'other/1' });
  events.emit('rpiv:ask-user:prompt', { toolCallId: 'parent/2' });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(emitted, { toolCallId: 'parent/2', cancel: true });
});

test('same-name arbitrary tool is not recognized', async () => {
  assert.equal(await knownRpiv({ getAllTools: () => [{ name: 'ask_user_question', parameters: {}, sourceInfo: { origin: 'top-level', source: 'local', path: 'evil.ts' } }] }, { mode: 'tui', tools: [{ name: 'ask_user_question' }] }), false);
});

const rpivPackage = '@juicesharp/rpiv-ask-user-question';
function rpivParameters() {
  return { type: 'object', properties: { questions: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', properties: {
    question: { type: 'string' }, header: { type: 'string', maxLength: 16 }, options: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'object', properties: { label: { type: 'string', maxLength: 60 }, description: { type: 'string' }, preview: { type: 'string' } }, required: ['label', 'description'] } }, multiSelect: { type: 'boolean' },
  }, required: ['question', 'header', 'options'] } } }, required: ['questions'] };
}
async function rpivFixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'elicitation-rpiv-identity-'));
  const writeIdentity = (version, name = rpivPackage) => writeFile(join(root, 'package.json'), JSON.stringify({ name, version }));
  try {
    await writeFile(join(root, 'index.ts'), '// fixture entry\n');
    await writeFile(join(root, 'other.ts'), '// wrapper entry\n');
    const notifications = [], tool = { name: 'ask_user_question', parameters: rpivParameters(), sourceInfo: { origin: 'package', source: `npm:${rpivPackage}`, path: join(root, 'index.ts') } };
    const pi = { getAllTools: () => [tool] };
    const ctx = { mode: 'tui', tools: [{ name: 'ask_user_question' }], ui: { notify: (...args) => notifications.push(args) } };
    await run({ root, writeIdentity, notifications, tool, recognize: () => knownRpiv(pi, ctx) });
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
}

test('qualified RPIV is silent; future versions try compatible schema and warn once per identity', async () => {
  await rpivFixture(async ({ root, writeIdentity, notifications, tool, recognize }) => {
    await writeIdentity('2.13.9');
    assert.equal(await recognize(), true);
    assert.equal(notifications.length, 0);
    await writeIdentity('99.0.0');
    for (const source of [`npm:${rpivPackage}`, `npm:${rpivPackage}@99.0.0`, root]) {
      tool.sourceInfo.source = source;
      assert.equal(await recognize(), true);
      assert.equal(await recognize(), true);
    }
    assert.equal(notifications.length, 1);
    assert.match(notifications[0][0], /RPIV 99[.]0[.]0 compatibility is unknown/u);
    assert.equal(notifications[0][1], 'warning');
    await writeIdentity('100.0.0');
    tool.sourceInfo.source = `npm:${rpivPackage}@100.0.0`;
    assert.equal(await recognize(), true);
    assert.equal(notifications.length, 2);
  });
});

test('future RPIV still rejects spoofed name, entry, provenance, and incompatible schema', async () => {
  await rpivFixture(async ({ root, writeIdentity, notifications, tool, recognize }) => {
    await writeIdentity('99.0.0', 'rpiv-lookalike');
    assert.equal(await recognize(), false);
    await writeIdentity('99.0.0');
    tool.sourceInfo.path = join(root, 'other.ts');
    assert.equal(await recognize(), false);
    tool.sourceInfo.path = join(root, 'index.ts');
    for (const source of [`npm:${rpivPackage}@2.13.9`, `npm:${rpivPackage}-spoof`, join(root, 'other.ts')]) {
      tool.sourceInfo.source = source;
      assert.equal(await recognize(), false);
    }
    tool.sourceInfo.source = `npm:${rpivPackage}@99.0.0`;
    tool.parameters.properties.questions.maxItems = 5;
    assert.equal(await recognize(), false);
    assert.equal(notifications.length, 0);
  });
});

test('in-process adapters discover across load order and dispose without stale registration', () => {
  const events = bus(), pi = { events, on: () => () => {} }, signal = new AbortController().signal;
  assert.equal(discoverAdapters(pi, signal).size, 0);
  const dispose = registerElicitationAdapter(pi, { version: 1, id: 'future', supports: () => true, collect: async () => ({ content: {} }) });
  assert.equal(discoverAdapters(pi, signal).has('future'), true);
  dispose(); dispose();
  assert.equal(discoverAdapters(pi, signal).size, 0);
});
