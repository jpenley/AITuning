import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../src/form.mjs';
import { decodeRpiv, rpivPlan, rpivCollect, knownRpiv } from '../src/providers.mjs';
import { registerElicitationAdapter, discoverAdapters } from '../src/adapters.mjs';
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

test('in-process adapters discover across load order and dispose without stale registration', () => {
  const events = bus(), pi = { events, on: () => () => {} }, signal = new AbortController().signal;
  assert.equal(discoverAdapters(pi, signal).size, 0);
  const dispose = registerElicitationAdapter(pi, { version: 1, id: 'future', supports: () => true, collect: async () => ({ content: {} }) });
  assert.equal(discoverAdapters(pi, signal).has('future'), true);
  dispose(); dispose();
  assert.equal(discoverAdapters(pi, signal).size, 0);
});
