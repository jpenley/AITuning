import assert from 'node:assert/strict';
import test from 'node:test';
import { sdk, history, context, assistant, zeroUsage } from './helpers.mjs';
import { captureView, finalizeSnapshot, summarizeSnapshot } from '../src/host.mjs';
import { PredictiveCompaction } from '../src/core.mjs';

test('native projection retains a small current step plus every post-snapshot message', () => {
  const manager = sdk.SessionManager.inMemory(process.cwd());
  const current = history(manager), ctx = context(manager);
  manager.appendMessage(assistant('Small CURRENT STEP ' + 'x'.repeat(1000)));
  const view = captureView(sdk, ctx, 'small prompt'); assert.ok(view.canSnapshot);
  const snapshot = view.snapshot();
  const nativeCut = manager.getBranch().findIndex(e => e.id === snapshot.cutId);
  assert.ok(nativeCut <= manager.getBranch().findIndex(e => e.id === current));
  const tailId = manager.appendMessage({ role: 'user', content: 'NEW TAIL exactly', timestamp: 3 });
  manager.appendMessage(assistant('NEW TAIL response'));
  const late = captureView(sdk, ctx, 'small prompt'); assert.ok(late.accepts(snapshot));
  const packet = finalizeSnapshot(sdk, { snapshot, result: { summary: 'Native summary' }, jobId: 'one', latencyMs: 1000 }, late).compaction;
  manager.appendCompaction(packet.summary, packet.firstKeptEntryId, packet.tokensBefore, packet.details, true);
  const projected = manager.buildSessionProjection();
  assert.ok(projected.entries.some(e => e.sourceEntry.id === current));
  assert.ok(projected.entries.some(e => e.sourceEntry.id === tailId));
  assert.ok(JSON.stringify(projected.messages).includes('Small CURRENT STEP'));
  assert.ok(projected.messages.some(m => m.content === 'NEW TAIL exactly'));
});

test('all discarded human text and Ruling lines are exact across two compactions; file metadata survives hooks', () => {
  const manager = sdk.SessionManager.inMemory(process.cwd()); history(manager);
  const ctx = context(manager);
  let snapshot = captureView(sdk, ctx, '').snapshot();
  let packet = finalizeSnapshot(sdk, { snapshot, result: { summary: 'Native one', details: { readFiles: ['old.ts'], modifiedFiles: ['changed.ts'] } }, jobId: 'one' }, captureView(sdk, ctx, '')).compaction;
  assert.ok(packet.summary.includes('Do not publish. Approval applies once only.\r\nKeep emoji: 🛠️ and accents: café.'));
  assert.ok(packet.summary.includes('Ruling: no global approval waiver.\r\n'));
  const firstRecords = structuredClone(packet.details.predictive.verbatim);
  manager.appendCompaction(packet.summary, packet.firstKeptEntryId, packet.tokensBefore, packet.details, true);
  history(manager, 10);
  snapshot = captureView(sdk, ctx, '').snapshot();
  assert.ok(snapshot.preparation.fileOps.read.has('old.ts'));
  assert.ok(snapshot.preparation.fileOps.written.has('changed.ts'));
  assert.ok(!snapshot.preparation.previousSummary.includes('Verbatim retained directives'));
  for (const record of firstRecords) assert.ok(snapshot.verbatim.some(r => r.key === record.key && r.text === record.text));
});

test('context edits, branch changes and model/settings changes cannot reuse a stale prefix', () => {
  const manager = sdk.SessionManager.inMemory(process.cwd()); history(manager);
  const ctx = context(manager), first = captureView(sdk, ctx, ''), snapshot = first.snapshot();
  assert.equal(captureView(sdk, context(manager, { model: { ...ctx.model, id: 'different' } }), '').accepts(snapshot), false);
  assert.equal(captureView(sdk, context(manager, { getCompactionSettings: () => ({ enabled: true, reserveTokens: 8000, keepRecentTokens: 20000 }) }), '').accepts(snapshot), false);
  const old = manager.getBranch().find(e => e.type === 'message' && e.message.role === 'assistant');
  manager.appendContextEdit(old.id, assistant('Corrected old content'));
  assert.equal(captureView(sdk, ctx, '').accepts(snapshot), false);
  manager.branch(old.id); assert.equal(captureView(sdk, ctx, '').accepts(snapshot), false);
});

test('open tool calls prevent a snapshot, and complete calls in the current step remain raw', () => {
  const manager = sdk.SessionManager.inMemory(process.cwd()); history(manager);
  manager.appendMessage(assistant('', { content: [{ type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: 'api.ts' } }], stopReason: 'toolUse' }));
  const ctx = context(manager);
  assert.equal(captureView(sdk, ctx, '').canSnapshot, false);
  manager.appendMessage({ role: 'toolResult', toolCallId: 'call-1', toolName: 'read', content: [{ type: 'text', text: 'full code result' }], isError: false, timestamp: 3 });
  assert.equal(captureView(sdk, ctx, '').canSnapshot, true);
});

test('steering between a tool call and its result keeps both sides of the pair raw', () => {
  const manager = sdk.SessionManager.inMemory(process.cwd()); history(manager);
  const call = manager.appendMessage(assistant('', { content: [{ type: 'toolCall', id: 'steered', name: 'read', arguments: { path: 'api.ts' } }], stopReason: 'toolUse' }));
  manager.appendMessage({ role: 'user', content: 'Steering: keep this correction verbatim.', timestamp: 3 });
  manager.appendMessage({ role: 'toolResult', toolCallId: 'steered', toolName: 'read', content: [{ type: 'text', text: 'code returned before the next edit' }], isError: false, timestamp: 4 });
  const ctx = context(manager), view = captureView(sdk, ctx, ''), snapshot = view.snapshot();
  assert.ok(manager.getBranch().findIndex(e => e.id === snapshot.cutId) <= manager.getBranch().findIndex(e => e.id === call));
});

test('Luna medium uses native compaction, records every usage attempt once, and rejects partial output', async () => {
  const manager = sdk.SessionManager.inMemory(process.cwd()); history(manager);
  const records = [], calls = [];
  const model = { id: 'gpt-6-luna', provider: 'openai', api: 'openai-responses', maxTokens: 128000, contextWindow: 272000, reasoning: true };
  let stopReason = 'stop';
  const ctx = context(manager, { createUsageRecorder: () => (...args) => records.push(args), modelRegistry: { find: () => model, streamSimple: (m, c, o) => ({ result: async () => {
    calls.push({ m, c, o }); return assistant('## Goal\nNative summary\n', { model: model.id, stopReason, usage: { ...zeroUsage(), input: 50, output: 10, totalTokens: 60 } });
  } }) } });
  const snapshot = captureView(sdk, ctx, '').snapshot();
  const result = await summarizeSnapshot(sdk, snapshot, { signal: new AbortController().signal, jobId: 'usage-test' });
  assert.equal(calls[0].m.id, 'gpt-6-luna'); assert.equal(calls[0].o.reasoning, 'medium'); assert.equal(calls[0].o.cacheRetention, 'none');
  assert.equal(snapshot.preparation.isSplitTurn, true);
  assert.equal(result.usage, undefined); assert.equal(records.length, 2); assert.equal(records[0][3].input, 50);
  assert.equal(calls[1].o.reasoning, 'medium');
  stopReason = 'length';
  await assert.rejects(summarizeSnapshot(sdk, snapshot, { signal: new AbortController().signal, jobId: 'partial' }), /partial output rejected/);
  assert.equal(records.length, 3);
});

test('protected Ruling records retain standalone carriage returns', () => {
  const manager = sdk.SessionManager.inMemory(process.cwd());
  manager.appendMessage({ role: 'user', content: 'Earlier step', timestamp: 1 });
  manager.appendMessage(assistant('Ruling: do not publish.\rNext line')); history(manager);
  const snapshot = captureView(sdk, context(manager), '').snapshot();
  assert.ok(snapshot.verbatim.some(record => record.text === 'Ruling: do not publish.\r'));
});

// Break caught: silently shrinking residual overhead or counting protected records twice.
test('before and after estimates share overhead and include protected text once', () => {
  const manager = sdk.SessionManager.inMemory(process.cwd()); history(manager, 4);
  const messages = manager.buildSessionProjection().messages;
  const baseline = messages.reduce((sum, message) => sum + sdk.estimateTokens(message), 0);
  const ctx = context(manager, { getContextUsage: () => ({ tokens: baseline + 49450, contextWindow: 272000 }) });
  const view = captureView(sdk, ctx, 'small system prompt');
  const packet = finalizeSnapshot(sdk, { snapshot: view.snapshot(), result: { summary: 'A useful native summary' }, jobId: 'accounting' }, view);
  const cut = view.projected.findIndex(entry => entry.sourceEntry.id === packet.compaction.firstKeptEntryId);
  const retained = view.projected.slice(cut).flatMap(entry => entry.messages).reduce((sum, message) => sum + sdk.estimateTokens(message), 0);
  const summary = sdk.estimateTokens({ role: 'user', content: packet.compaction.summary, timestamp: 0 });
  assert.equal(view.overhead, 49450); assert.equal(view.usageResidualTokens, 49450);
  assert.equal(view.estimatedTokensBefore, baseline + 49450);
  assert.ok(packet.protectedTokens > 0);
  assert.equal(packet.tokensAfter, Math.ceil(49450 + 128 + summary + retained));
});

test('negative usage residual does not subtract prompt overhead from either estimate', () => {
  const manager = sdk.SessionManager.inMemory(process.cwd()); history(manager, 4);
  const baseline = manager.buildSessionProjection().messages.reduce((sum, message) => sum + sdk.estimateTokens(message), 0);
  const view = captureView(sdk, context(manager, { getContextUsage: () => ({ tokens: baseline - 1000, contextWindow: 272000 }) }), 'prompt text');
  assert.equal(view.usageResidualTokens, 0);
  assert.equal(view.overhead, sdk.estimateTokens({ role: 'user', content: 'prompt text', timestamp: 0 }));
  assert.equal(view.estimatedTokensBefore, baseline + view.overhead);
});

// Break caught: long exact directives can inflate workload without funding useful compression.
test('protected prefix growth does not fund a replacement by inflating sourceSize', async () => {
  const manager = sdk.SessionManager.inMemory(process.cwd()); history(manager, 4);
  const ctx = context(manager);
  const before = captureView(sdk, ctx, ''); let calls = 0;
  const engine = new PredictiveCompaction({ summarize: async () => { ++calls; return { summary: 'Prepared execution' }; },
    finalize: (ready, view) => finalizeSnapshot(sdk, ready, view) });
  engine.setEnabled(true); await engine.start(before.snapshot()).promise;
  manager.appendMessage({ role: 'user', content: 'Exact directive ' + 'U'.repeat(120000), timestamp: 3 });
  manager.appendMessage(assistant('x'.repeat(84000)));
  const after = captureView(sdk, ctx, '');
  assert.ok(after.sourceSize - before.sourceSize >= 25000, 'fixture adds enough workload for the old refresh rule');
  engine.observe(after); if (engine.active) await engine.active.promise;
  assert.equal(calls, 1, 'protected workload is not prospective savings');
  assert.ok(after.reclaimableSize - before.reclaimableSize < 25000);
});
