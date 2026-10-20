import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTelemetry, safeRecord } from '../src/telemetry.mjs';

const directory = () => mkdtempSync(join(tmpdir(), 'predictive-log-'));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function saved(root, session = 'session1') {
  return readdirSync(join(root, session)).sort().flatMap(file => readFileSync(join(root, session, file), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
}

test('writer orders and rotates metadata without copying conversation or provider errors', async () => {
  const root = directory(); let clock = 1000;
  const log = createTelemetry({ sessionId: 'session1', runId: 'run1', directory: root, maxFileBytes: 4096, wallNow: () => 1792310400000, monotonicNow: () => clock });
  for (let i = 0; i < 30; i++) {
    clock = i % 2 ? 900 : 1100; // A backwards clock cannot reorder elapsed time.
    log.record('provider_call_finished', { call: i, jobId: 'job_123', outcome: 'success', inputTokens: 100, totalTokens: 120, usageKnown: true,
      summary: 'PRIVATE SUMMARY', prompt: 'PRIVATE PROMPT', errorMessage: 'PRIVATE ERROR', customInstructions: 'PRIVATE INSTRUCTIONS', reason: 'PRIVATE REASON', cost: NaN, outputTokens: -1 });
  }
  await log.flush();
  const events = saved(root);
  assert.equal(events.length, 30);
  assert.ok(events.every((e, i) => e.seq === i + 1 && e.sessionId === 'session1' && e.runId === 'run1' && e.schemaVersion === 1 && e.call === i && e.elapsedMs === 100));
  assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
  assert.ok(events.every(e => e.cost === undefined && e.outputTokens === undefined && e.inputTokens === 100));
  assert.ok(readdirSync(join(root, 'session1')).length > 1);
  assert.ok(readdirSync(join(root, 'session1')).every(f => statSync(join(root, 'session1', f)).size <= 4096));
  assert.equal(log.status().written, 30); assert.equal(log.status().healthy, true);
});

test('bounded queue reports dropped events and flush drains them in sequence', async () => {
  const gate = deferred(), batches = [];
  const log = createTelemetry({ sessionId: 'session1', directory: directory(), maxQueue: 2,
    append: async (_file, data) => { batches.push(data); await gate.promise; } });
  for (let i = 0; i < 10; i++) log.record('context_observed', { contextTokens: i });
  assert.equal(log.status().queued, 3); // One writing, two waiting.
  assert.equal(log.status().dropped, 7);
  gate.resolve(); await log.flush();
  const events = batches.join('').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e => e.seq), [1, 2, 3, 11]);
  assert.equal(events.at(-1).event, 'events_dropped');
  assert.equal(events.at(-1).droppedBefore, 7);
  assert.equal(log.status().queued, 0);
});

test('I/O failure disables only logging, warns once and never exposes raw errors', async () => {
  const notices = [];
  const log = createTelemetry({ sessionId: 'session1', directory: directory(), warn: s => notices.push(s),
    append: async () => { throw Object.assign(new Error('PRIVATE PATH AND PROVIDER DETAIL'), { code: 'EACCES' }); } });
  assert.equal(log.record('session_started'), true);
  await log.flush();
  assert.equal(log.status().healthy, false); assert.equal(log.status().errorCode, 'EACCES');
  assert.equal(log.record('compaction_committed'), false);
  await log.flush(); assert.equal(notices.length, 1); assert.equal(notices[0].includes('PRIVATE'), false);
  assert.equal(safeRecord(() => { throw new Error('broken sink'); }, 'session_started'), false);
});

test('invalid identifiers never form paths; a non-directory root fails without rejecting lifecycle', async () => {
  const root = directory();
  for (const sessionId of ['../escape', '', 'C:\\escape', 'a/b', 'a'.repeat(81)]) {
    const log = createTelemetry({ sessionId, directory: root });
    assert.equal(log.record('session_started'), false); await log.flush();
    assert.equal(log.status().errorCode, 'INVALID_LOG_OPTIONS');
  }
  assert.deepEqual(readdirSync(root), []);
  const file = join(root, 'file'); writeFileSync(file, 'unrelated data');
  const log = createTelemetry({ sessionId: 'session1', directory: file });
  log.record('session_started'); await log.flush();
  assert.equal(log.status().healthy, false); assert.equal(readFileSync(file, 'utf8'), 'unrelated data');
});

test('restarts use distinct run files and keep late records bound to their original session', async () => {
  const root = directory();
  const old = createTelemetry({ sessionId: 'old_session', directory: root });
  const fresh = createTelemetry({ sessionId: 'new_session', directory: root });
  const restart = createTelemetry({ sessionId: 'new_session', directory: root });
  old.record('session_ended'); fresh.record('session_started'); restart.record('session_started');
  old.record('provider_call_finished', { totalTokens: 520, usageKnown: true, outcome: 'aborted' });
  await Promise.all([old.flush(), fresh.flush(), restart.flush()]);
  assert.notEqual(fresh.status().runId, restart.status().runId);
  assert.equal(saved(root, 'old_session').find(e => e.event === 'provider_call_finished').totalTokens, 520);
  assert.equal(saved(root, 'new_session').some(e => e.event === 'provider_call_finished'), false);
  assert.equal(readdirSync(join(root, 'new_session')).length, 2);
});
