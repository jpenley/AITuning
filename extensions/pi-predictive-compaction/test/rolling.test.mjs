import test from 'node:test';
import assert from 'node:assert/strict';
import { sdk, context, assistant } from './helpers.mjs';
import { captureView, finalizeSnapshot } from '../src/host.mjs';

// Break caught: pinning the whole active step prevents the cut from ever advancing.
test('one large user step rolls across multiple checkpoints without losing directives or the live tail', () => {
  const manager = sdk.SessionManager.inMemory(process.cwd());
  const directive = 'Implement the API. Do not publish. Approval is for this step only.\r\nKeep café 🛠️ exactly.';
  const stepId = manager.appendMessage({ role: 'user', content: directive, timestamp: 1 });
  manager.appendMessage(assistant('Ruling: do not change the approval scope.\r\n' + 'older execution '.repeat(9000)));
  manager.appendMessage(assistant('recent execution '.repeat(9000)));
  const ctx = context(manager);
  let snapshot = captureView(sdk, ctx, '').snapshot();
  assert.ok(manager.getBranch().findIndex(e => e.id === snapshot.cutId) > manager.getBranch().findIndex(e => e.id === stepId));
  assert.equal(snapshot.stepId, stepId);
  const lateId = manager.appendMessage(assistant('AFTER SNAPSHOT: preserve this exact continuation.'));
  const packet = finalizeSnapshot(sdk, { snapshot, result: { summary: 'Checkpoint one', details: { modifiedFiles: ['api.ts'] } }, jobId: 'one' }, captureView(sdk, ctx, '')).compaction;
  assert.ok(packet.summary.includes(directive));
  assert.ok(packet.summary.includes('Ruling: do not change the approval scope.\r\n'));
  manager.appendCompaction(packet.summary, packet.firstKeptEntryId, packet.tokensBefore, packet.details, true);
  assert.ok(manager.buildSessionProjection().entries.some(e => e.sourceEntry.id === lateId && e.messages.length));
  manager.appendMessage(assistant('more completed execution '.repeat(9000)));
  manager.appendMessage(assistant('new recent execution '.repeat(9000)));
  snapshot = captureView(sdk, ctx, '').snapshot();
  assert.equal(snapshot.stepId, stepId, 'logical step survives when its user message is no longer raw');
  assert.notEqual(snapshot.cutId, packet.firstKeptEntryId);
  assert.match(snapshot.preparation.previousSummary, /Checkpoint one/);
  assert.equal(snapshot.verbatim.filter(r => r.text === directive).length, 1);
  assert.ok(snapshot.preparation.fileOps.written.has('api.ts'));
});
