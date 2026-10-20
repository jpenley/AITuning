import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerPredictiveCompaction } from '../src/extension.mjs';
import { sdk, context, history } from './helpers.mjs';

export function lifecycle(directory = mkdtempSync(join(tmpdir(), 'predictive-telemetry-'))) {
  const handlers = new Map(), commands = new Map(), notices = [];
  const manager = sdk.SessionManager.inMemory(directory); history(manager, 2);
  const ctx = context(manager, { isIdle: () => true,
    ui: { notify: (...args) => notices.push(args), setStatus: () => {} },
    modelRegistry: { find: () => ({}), hasConfiguredAuth: () => true },
  });
  const engine = registerPredictiveCompaction({ on: (name, fn) => handlers.set(name, fn), registerCommand: (name, command) => commands.set(name, command), appendEntry: () => {} }, sdk,
    { preferencesPath: join(directory, 'preferences.json'), telemetryDirectory: join(directory, 'logs'), intervalMs: 60000 });
  return { directory, manager, ctx, engine, notices,
    event: (name, event = {}) => handlers.get(name)?.(event, ctx),
    command: arg => commands.get('predictive-compaction').handler(arg, ctx),
  };
}

function readEvents(h) {
  const directory = join(h.directory, 'logs', h.manager.getSessionId());
  assert.ok(existsSync(directory), 'a session lifecycle must create a diagnostic stream');
  return readdirSync(directory).filter(f => f.endsWith('.jsonl')).flatMap(f => readFileSync(join(directory, f), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)).sort((a, b) => a.seq - b.seq);
}

test('extension discovery is inert; lifecycle, toggles, commits and shutdown form a saved session stream', async () => {
  const h = lifecycle();
  assert.equal(existsSync(join(h.directory, 'logs')), false);
  await h.event('session_start');
  try {
    await h.command('on');
    await h.event('agent_start');
    await h.event('agent_end');
    await h.event('session_before_compact', { reason: 'manual' });
    await h.event('session_compact', { reason: 'manual', fromExtension: false, compactionEntry: { id: 'entry123', tokensBefore: 250000, summary: 'PRIVATE SUMMARY', details: {} } });
    await h.command('off');
    await h.command('status');
    assert.ok(h.notices.some(([s]) => s.includes('logging')));
  } finally { await h.event('session_shutdown', { reason: 'quit' }); }
  const events = readEvents(h);
  assert.equal(events[0].event, 'session_started');
  assert.equal(events.at(-1).event, 'session_ended');
  assert.ok(events.some(e => e.event === 'enabled_changed' && e.enabled));
  assert.ok(events.some(e => e.event === 'compaction_requested' && e.reason === 'manual'));
  assert.ok(events.some(e => e.event === 'compaction_committed' && e.tokensBefore === 250000));
  assert.ok(events.every((e, i) => e.sessionId === h.manager.getSessionId() && e.seq === i + 1 && Number.isFinite(e.elapsedMs) && !Number.isNaN(Date.parse(e.timestamp))));
  assert.equal(JSON.stringify(events).includes('PRIVATE SUMMARY'), false);
});

test('an aborted manual request remains cancelled and is logged as aborted, never native fallback', async () => {
  const h = lifecycle(); await h.event('session_start');
  try {
    await h.command('on');
    const controller = new AbortController(); controller.abort();
    const result = await h.event('session_before_compact', { reason: 'manual', signal: controller.signal });
    assert.deepEqual(result, { cancel: true });
    await h.event('session_compact_failed', { reason: 'manual', aborted: true, fromExtension: false, willRetry: false });
  } finally { await h.event('session_shutdown'); }
  const events = readEvents(h);
  assert.equal(events.some(e => e.event === 'native_fallback'), false);
  assert.ok(events.some(e => e.event === 'compaction_failed' && e.aborted && e.outcome === 'aborted'));
});

test('an unwritable diagnostic destination leaves controls and manual native recovery working', async () => {
  const h = lifecycle(); writeFileSync(join(h.directory, 'logs'), 'existing file');
  await h.event('session_start');
  try {
    await h.command('on'); assert.equal(h.engine.enabled, true);
    assert.equal(await h.event('session_before_compact', { reason: 'manual' }), undefined);
    await h.event('session_compact', { reason: 'manual', fromExtension: false, compactionEntry: { id: 'native123', tokensBefore: 250000 } });
    assert.notEqual(h.engine.status().phase, 'handoff');
  } finally { await h.event('session_shutdown'); }
  await h.command('status');
  const status = h.notices.map(([s]) => { try { return JSON.parse(s); } catch { return null; } }).find(s => s?.logging);
  assert.equal(status.logging.healthy, false);
  assert.equal(h.notices.filter(([s]) => s.includes('logging unavailable')).length, 1);
  assert.equal(readFileSync(join(h.directory, 'logs'), 'utf8'), 'existing file');
});
