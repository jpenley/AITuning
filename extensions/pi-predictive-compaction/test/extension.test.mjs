import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerPredictiveCompaction } from '../src/extension.mjs';
import { readPreferences } from '../src/preferences.mjs';
import { sdk, context, history } from './helpers.mjs';

function harness(supported = true) {
  const handlers = new Map(), commands = new Map(), notifications = [], statuses = [];
  const path = join(mkdtempSync(join(tmpdir(), 'predictive-controls-')), 'settings.json');
  const manager = sdk.SessionManager.inMemory(process.cwd()); history(manager);
  const ctx = context(manager, { isIdle: () => true, ui: { notify: (...args) => notifications.push(args), setStatus: (...args) => statuses.push(args) }, modelRegistry: { find: () => ({}), hasConfiguredAuth: () => true } });
  const pi = { registerCommand: (name, cmd) => commands.set(name, cmd), on: (name, fn) => handlers.set(name, fn), appendEntry: () => {} };
  const engine = registerPredictiveCompaction(pi, { ...sdk, PREDICTIVE_COMPACTION_SDK_VERSION: supported ? 1 : undefined }, { preferencesPath: path, telemetryDirectory: path + '-logs', intervalMs: 60000 });
  return { engine, path, ctx, notifications, statuses, event: name => handlers.get(name)?.({}, ctx), command: arg => commands.get('predictive-compaction').handler(arg, ctx) };
}

test('discovery is inert; on/off/status persist controls and shutdown stops background observation', async () => {
  const h = harness(); assert.equal(h.engine.enabled, false); assert.equal(h.notifications.length, 0);
  h.event('session_start'); assert.equal(h.engine.status().phase, 'off');
  await h.command('on'); assert.equal(readPreferences(h.path).enabled, true, JSON.stringify(h.notifications)); assert.equal(h.engine.status().phase, 'watching');
  assert.deepEqual(h.statuses.at(-1), ['predictive-compaction', 'predict']);
  await h.command('status'); assert.ok(h.notifications.some(([s]) => s.includes('gpt-6-luna')));
  await h.command('off'); assert.equal(readPreferences(h.path).enabled, false); assert.equal(h.engine.enabled, false);
  assert.deepEqual(h.statuses.at(-1), ['predictive-compaction', undefined]);
  h.event('session_shutdown'); assert.equal(h.engine.enabled, false);
});

test('missing SDK or malformed preferences cannot silently enable inference', async () => {
  const h = harness(false); h.event('session_start'); await h.command('on');
  assert.equal(h.engine.enabled, false); assert.equal(readPreferences(h.path).enabled, false);
  assert.ok(h.notifications.some(([s]) => s.includes('SDK support')));
  writeFileSync(h.path, '{"enabled":"yes"}');
  h.event('session_start'); assert.equal(h.engine.enabled, false);
  assert.ok(h.notifications.some(([s]) => s.includes('Invalid predictive-compaction settings')));
  h.event('session_shutdown');
});

test('idle watching does not repeatedly clone or hash the conversation', async () => {
  const h = harness();
  h.ctx.getContextUsage = () => { throw new Error('Idle context must not be walked'); };
  h.event('session_start'); await h.command('on');
  assert.equal(h.engine.enabled, true); assert.equal(h.engine.status().lastError, undefined);
  h.event('turn_end'); assert.equal(h.engine.status().lastError, undefined);
  h.event('session_shutdown');
});

test('shutdown clears the inline indicator without changing the saved preference', async () => {
  const h = harness(); h.event('session_start');
  try {
    await h.command('on');
    h.event('session_shutdown');
    assert.deepEqual(h.statuses.at(-1), ['predictive-compaction', undefined]);
    assert.equal(readPreferences(h.path).enabled, true);
  } finally { h.event('session_shutdown'); }
});
