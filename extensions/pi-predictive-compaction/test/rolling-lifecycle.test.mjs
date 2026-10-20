import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sdk, context, assistant, zeroUsage } from './helpers.mjs';
import { registerPredictiveCompaction } from '../src/extension.mjs';
import { captureView, finalizeSnapshot } from '../src/host.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'predictive-rolling-'));
  const handlers = new Map(), notices = [], manager = sdk.SessionManager.inMemory(directory);
  manager.appendMessage({ role: 'user', content: 'Finish this large step. Do not publish.', timestamp: 1 });
  manager.appendMessage(assistant('completed first segment '.repeat(40000)));
  manager.appendMessage(assistant('recent segment '.repeat(6000)));
  let calls = 0, release, idle = true;
  const model = { id: 'gpt-6-luna', provider: 'openai', api: 'openai-responses', maxTokens: 128000, contextWindow: 272000 };
  const ctx = context(manager, { isIdle: () => idle, hasPendingMessages: () => false, getContextUsage: () => ({ tokens: 217882, contextWindow: 272000 }),
    ui: { notify: (...args) => notices.push(args), setStatus: () => {} }, modelRegistry: { find: () => model, hasConfiguredAuth: () => true, streamSimple: () => ({ result: () => {
      ++calls; return new Promise(resolve => { release = () => resolve(assistant('## Goal\nConsolidated checkpoint', { usage: { ...zeroUsage(), input: 10, output: 10, totalTokens: 20 } })); });
    } }) } });
  const engine = registerPredictiveCompaction({ on: (name, fn) => handlers.set(name, fn), registerCommand: () => {}, appendEntry: () => {} }, sdk, { preferencesPath: join(directory, 'preferences.json'), telemetryDirectory: join(directory, 'logs'), intervalMs: 60000 });
  const event = (name, value = {}) => handlers.get(name)?.(value, ctx);
  event('session_start'); engine.setEnabled(true);
  return { manager, ctx, engine, event, notices, calls: () => calls, release: () => release?.(), setIdle: value => { idle = value; } };
}

// Break caught: a native trigger must not wait for unfinished prediction or restart it during fallback.
test('native compaction takes over immediately while an unfinished predictor is fenced', async () => {
  const h = harness();
  try {
    const job = h.engine.start(captureView(sdk, h.ctx, '').snapshot());
    let finished = false, result;
    const taking = h.event('session_before_compact', { reason: 'threshold', signal: new AbortController().signal }).then(value => { result = value; finished = true; });
    await flush();
    assert.equal(finished, true, 'native fallback must not wait for the speculative provider');
    await taking; assert.equal(result, undefined);
    assert.equal(job.controller.signal.aborted, true);
    assert.equal(h.calls(), 1); assert.equal(h.engine.consuming, true);
    h.setIdle(false);
    h.engine.observe({ ...captureView(sdk, h.ctx, ''), tokens: 260000 });
    assert.equal(h.calls(), 1, 'native fallback must suspend speculative scheduling');
    h.release(); await job.promise; await flush(); assert.equal(h.engine.ready, undefined);
    h.event('session_compact_failed', { reason: 'threshold', aborted: false, errorMessage: 'Controlled native failure' });
    assert.equal(h.engine.consuming, false, 'native failure must release observation without a hard-stop latch');
  } finally { await h.event('session_shutdown'); h.release(); }
});

// Break caught: agent_end can run before retries and must not launch consolidation.
test('consolidation starts only after successful settlement and never blocks settlement', async () => {
  const h = harness();
  try {
    const snapshot = captureView(sdk, h.ctx, '').snapshot();
    const packet = finalizeSnapshot(sdk, { snapshot, result: { summary: 'Mid-step checkpoint' }, jobId: 'mid' }, captureView(sdk, h.ctx, '')).compaction;
    h.manager.appendCompaction(packet.summary, packet.firstKeptEntryId, packet.tokensBefore, packet.details, true);
    h.manager.appendMessage(assistant('remaining completed work '.repeat(4000)));
    h.manager.appendMessage(assistant('Final answer: implementation complete.'));
    h.event('agent_end'); await flush(); assert.equal(h.calls(), 0);
    h.event('agent_before_settle', { outcome: 'completed' });
    assert.equal(h.event('agent_settled', { aborted: false }), undefined);
    await flush(); assert.equal(h.calls(), 1);
    assert.equal(h.engine.active.snapshot.consolidated, true);
    assert.ok(JSON.stringify(h.engine.active.snapshot.preparation).includes('Final answer: implementation complete.'));
    h.release(); await flush(); h.release(); await h.engine.active?.promise;
    assert.equal(h.engine.ready.snapshot.consolidated, true);
    h.event('agent_settled', { aborted: false }); await flush(); assert.ok(h.calls() <= 2);
  } finally { await h.event('session_shutdown'); }
});

test('automatic hooks start no prediction, while request abort and off still cancel', async () => {
  for (const mode of ['unready', 'abort', 'off']) {
    const h = harness();
    try {
      const controller = new AbortController();
      if (mode === 'abort') controller.abort();
      const taking = h.event('session_before_compact', { reason: 'threshold', signal: controller.signal });
      if (mode === 'off') h.engine.setEnabled(false);
      const result = await taking;
      if (mode === 'unready') assert.equal(result, undefined);
      else assert.deepEqual(result, { cancel: true });
      assert.equal(h.engine.metrics.started, 0);
      assert.equal(h.notices.filter(([text]) => text.includes('Using Pi native')).length, mode === 'unready' ? 1 : 0);
    } finally { await h.event('session_shutdown'); }
  }
});

test('a failed background predictor yields to native without another predictive call', async () => {
  const h = harness();
  try {
    let calls = 0;
    h.ctx.modelRegistry.streamSimple = () => ({ result: async () => { ++calls; throw new Error('Controlled provider failure'); } });
    await h.engine.start(captureView(sdk, h.ctx, '').snapshot()).promise;
    assert.equal(h.engine.metrics.failed, 1);
    assert.equal(await h.event('session_before_compact', { reason: 'overflow', signal: new AbortController().signal }), undefined);
    assert.equal(calls, 1); assert.equal(h.engine.metrics.started, 1);
    assert.equal(h.notices.filter(([text]) => text.includes('Using Pi native')).length, 1);
  } finally { await h.event('session_shutdown'); }
});

test('aborted, failed and queued settlements launch no consolidation', async () => {
  for (const mode of ['aborted', 'error', 'queued']) {
    const h = harness();
    try {
      h.ctx.hasPendingMessages = () => mode === 'queued';
      h.event('agent_before_settle', { outcome: mode === 'error' ? 'error' : 'completed' });
      h.event('agent_settled', { aborted: mode === 'aborted' });
      await flush(); assert.equal(h.calls(), 0);
    } finally { await h.event('session_shutdown'); }
  }
});

test('new input cancels an idle consolidation and cannot publish its late result', async () => {
  const h = harness();
  try {
    const snapshot = captureView(sdk, h.ctx, '').snapshot();
    const packet = finalizeSnapshot(sdk, { snapshot, result: { summary: 'Mid-step checkpoint' }, jobId: 'mid' }, captureView(sdk, h.ctx, '')).compaction;
    h.manager.appendCompaction(packet.summary, packet.firstKeptEntryId, packet.tokensBefore, packet.details, true);
    h.manager.appendMessage(assistant('remaining work '.repeat(5000)));
    h.manager.appendMessage(assistant('Final answer.'));
    h.event('agent_before_settle', { outcome: 'completed' }); h.event('agent_settled', { aborted: false });
    await flush(); const job = h.engine.active; assert.ok(job?.snapshot.consolidated);
    h.event('input'); await job.promise; h.release(); await flush();
    assert.equal(job.controller.signal.aborted, true); assert.equal(h.engine.ready, undefined);
  } finally { await h.event('session_shutdown'); }
});

test('a finished consolidation can be reused with a new raw user tail', async () => {
  const h = harness();
  try {
    h.ctx.getContextUsage = () => ({ tokens: h.manager.buildSessionProjection().messages.reduce((n, m) => n + sdk.estimateTokens(m), 0) + 2000, contextWindow: 272000 });
    const snapshot = captureView(sdk, h.ctx, '').snapshot();
    const packet = finalizeSnapshot(sdk, { snapshot, result: { summary: 'Mid-step checkpoint' }, jobId: 'mid' }, captureView(sdk, h.ctx, '')).compaction;
    h.manager.appendCompaction(packet.summary, packet.firstKeptEntryId, packet.tokensBefore, packet.details, true);
    h.manager.appendMessage(assistant('remaining work '.repeat(5000))); h.manager.appendMessage(assistant('Final answer.'));
    h.event('agent_before_settle', { outcome: 'completed' }); h.event('agent_settled', { aborted: false });
    await flush(); const job = h.engine.active; assert.ok(job?.snapshot.consolidated);
    for (let i = 0; i < 4; i++) { h.release(); await flush(); }
    await job.promise; assert.ok(h.engine.ready?.snapshot.consolidated);
    h.event('input');
    const userId = h.manager.appendMessage({ role: 'user', content: 'NEW REQUEST must remain raw.', timestamp: 4 });
    const result = await h.event('session_before_compact', { reason: 'threshold', signal: new AbortController().signal });
    assert.ok(result?.compaction); assert.equal(result.compaction.details.predictive.jobId, job.id);
    h.manager.appendCompaction(result.compaction.summary, result.compaction.firstKeptEntryId, result.compaction.tokensBefore, result.compaction.details, true);
    assert.ok(h.manager.buildSessionProjection().entries.some(e => e.sourceEntry.id === userId && e.messages.length));
  } finally { await h.event('session_shutdown'); }
});

test('post-result invalidation fences both successful packets and stale fallback errors', async () => {
  for (const result of [{ compaction: { summary: 'Stale checkpoint' } }, { cancel: true, failure: 'provider' }]) {
    const h = harness();
    try {
      h.engine.take = async () => { h.event('model_select'); return result; };
      assert.deepEqual(await h.event('session_before_compact', { reason: 'threshold' }), { cancel: true });
      assert.equal(h.notices.filter(([text]) => text.includes('Using Pi native')).length, 0);
    } finally { await h.event('session_shutdown'); }
  }
});

// Break caught: a blocked continuation skips its final boundary and must not reuse an earlier successful outcome.
test('a failed continuation cannot inherit an earlier completed pre-settlement outcome', async () => {
  const h = harness();
  try {
    const snapshot = captureView(sdk, h.ctx, '').snapshot();
    const packet = finalizeSnapshot(sdk, { snapshot, result: { summary: 'Mid-step checkpoint' }, jobId: 'mid' }, captureView(sdk, h.ctx, '')).compaction;
    h.manager.appendCompaction(packet.summary, packet.firstKeptEntryId, packet.tokensBefore, packet.details, true);
    h.manager.appendMessage(assistant('remaining completed work '.repeat(4000)));
    h.manager.appendMessage(assistant('Final answer before a requested continuation.'));
    h.event('agent_before_settle', { outcome: 'completed' });
    h.event('agent_start');
    // The blocked SDK boundary returns without another agent_before_settle notification.
    h.event('agent_settled', { aborted: false });
    await flush();
    assert.equal(h.calls(), 0, 'A failed final continuation cannot authorize optional consolidation');
  } finally { await h.event('session_shutdown'); h.release(); }
});

// Break caught: settlement bypassing the shared no-spend feasibility preflight.
test('impossible consolidation is skipped without consuming the later feasible attempt', async () => {
  const h = harness();
  try {
    const snapshot = captureView(sdk, h.ctx, '').snapshot();
    const packet = finalizeSnapshot(sdk, { snapshot, result: { summary: 'Mid-step checkpoint' }, jobId: 'mid' }, captureView(sdk, h.ctx, '')).compaction;
    h.manager.appendCompaction(packet.summary, packet.firstKeptEntryId, packet.tokensBefore, packet.details, true);
    h.manager.appendMessage(assistant('remaining completed work '.repeat(4000)));
    const finalId = h.manager.appendMessage(assistant('Final answer: ' + 'F'.repeat(1100000)));
    const view = captureView(sdk, h.ctx, h.ctx.getSystemPrompt(), undefined, { consolidate: true });
    assert.equal(view.consolidationEligible, true); assert.equal(view.canSnapshot, true);
    assert.equal(h.engine.retentionBudget(view).budgetReason, 'headroom');
    h.event('agent_before_settle', { outcome: 'completed' }); h.event('agent_settled', { aborted: false });
    await flush(); assert.equal(h.calls(), 0, 'an impossible consolidation must not call Luna');
    h.manager.appendContextEdit(finalId, assistant('Final answer: complete.'));
    h.event('agent_settled', { aborted: false });
    await flush(); assert.equal(h.calls(), 1, 'skipping must not consume the step attempt');
  } finally { await h.event('session_shutdown'); h.release(); }
});
