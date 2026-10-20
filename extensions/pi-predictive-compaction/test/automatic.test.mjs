import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findPackageJSON } from 'node:module';
import { sdk, root, history, assistant, zeroUsage } from './helpers.mjs';
import { registerPredictiveCompaction } from '../src/extension.mjs';
import { writePreferences } from '../src/preferences.mjs';

const aiPackage = findPackageJSON('@earendil-works/pi-ai', pathToFileURL(join(root, 'dist/index.js')));
const { createAssistantMessageEventStream } = await import(pathToFileURL(join(dirname(aiPackage), 'dist/utils/event-stream.js')));
globalThis.fetch = () => { throw new Error('Offline test forbids network'); };
process.env.PI_TELEMETRY = '0';

test('native agent events schedule Luna during foreground work, then automatic threshold compaction uses the ready checkpoint', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'predictive-auto-'));
  const preferencesPath = join(directory, 'predictive.json'); writePreferences(preferencesPath, true);
  const settingsManager = sdk.SettingsManager.inMemory({ defaultTools: [], compaction: { enabled: true }, retry: { enabled: false }, cacheWarming: 'off', enableAnalytics: false });
  const runtime = await sdk.ModelRuntime.create({ authPath: join(directory, 'empty-auth.json'), modelsPath: null, modelsStorePath: join(directory, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  await runtime.setRuntimeApiKey('openai', 'OFFLINE_TEST_VALUE');
  const model = runtime.getModel('openai', 'gpt-6.1-sol'); assert.ok(model);
  // Preparation leads the native reserve boundary; only Pi decides when to commit.
  const threshold = model.contextWindow - 16384;
  const startTokens = threshold - 20000;
  let engine, lunaCalls = 0, foregroundCalls = 0, phaseAtHook;
  const reasons = [];
  runtime.streamSimple = (m, _c, options) => ({ result: async () => {
    assert.equal(m.id, 'gpt-6-luna'); assert.equal(options.reasoning, 'medium'); ++lunaCalls;
    return assistant('## Goal\nContinue the current API edit.\n## Next Steps\nCheck the call site.', { model: m.id, timestamp: Date.now(), usage: { ...zeroUsage(), input: 100, output: 20, totalTokens: 120 } });
  } });
  const loader = new sdk.DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [pi => {
      pi.on('session_before_compact', event => { reasons.push(event.reason); phaseAtHook = engine.status().phase; });
      engine = registerPredictiveCompaction(pi, sdk, { preferencesPath, telemetryDirectory: join(directory, 'logs'), intervalMs: 60000 });
    }] });
  await loader.reload();
  const manager = sdk.SessionManager.inMemory(directory); history(manager, Math.ceil(startTokens / 11000));
  manager.appendMessage(assistant('Recorded foreground usage', { timestamp: Date.now() - 1000, usage: { ...zeroUsage(), input: startTokens, totalTokens: startTokens } }));
  const { session } = await sdk.createAgentSession({ cwd: directory, agentDir: directory, modelRuntime: runtime, model, thinkingLevel: 'medium', resourceLoader: loader, settingsManager, sessionManager: manager, tools: ['pulse'], customTools: [{
    name: 'pulse', label: 'Pulse', description: 'Return the controlled editing result', parameters: { type: 'object', properties: {} },
    execute: async () => {
      assert.ok(engine.active || engine.ready, 'Native agent_start must have started Luna before the foreground tool');
      if (engine.active) await engine.active.promise;
      return { content: [{ type: 'text', text: 'CURRENT STEP full tool result remains raw' }], details: {} };
    },
  }] });
  try {
    await session.bindExtensions({}); assert.equal(engine.enabled, true);
    session.agent.streamFunction = () => {
      ++foregroundCalls; assert.ok(foregroundCalls <= 2, 'No extra foreground request');
      const first = foregroundCalls === 1;
      const message = assistant(first ? '' : 'CURRENT STEP final answer', { timestamp: Date.now(), stopReason: first ? 'toolUse' : 'stop',
        content: first ? [{ type: 'toolCall', id: 'controlled-call', name: 'pulse', arguments: {} }] : [{ type: 'text', text: 'CURRENT STEP final answer' }],
        usage: { ...zeroUsage(), input: first ? startTokens + 100 : threshold + 1000, output: 20, totalTokens: first ? startTokens + 120 : threshold + 1020 } });
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => { stream.push({ type: 'start', partial: message }); stream.push({ type: 'done', reason: message.stopReason, message }); });
      return stream;
    };
    await session.prompt('Continue the CURRENT STEP editing request exactly.');
    assert.equal(foregroundCalls, 2); assert.ok(lunaCalls > 0);
    assert.deepEqual(reasons, ['threshold']); assert.equal(phaseAtHook, 'ready');
    assert.equal(engine.status().metrics.blocking, 0); assert.equal(engine.status().metrics.hits, 1);
    assert.equal(manager.getEntries().filter(e => e.type === 'compaction').length, 1);
    assert.ok(JSON.stringify(manager.buildSessionProjection().messages).includes('CURRENT STEP full tool result remains raw'));
    assert.ok(JSON.stringify(manager.buildSessionProjection().messages).includes('Continue the CURRENT STEP editing request exactly.'));
  } finally { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); }
  const events = readdirSync(join(directory, 'logs', manager.getSessionId())).flatMap(file => readFileSync(join(directory, 'logs', manager.getSessionId(), file), 'utf8').trim().split('\n').map(JSON.parse));
  for (const event of ['context_observed', 'schedule_decision', 'job_started', 'job_ready', 'provider_call_finished', 'checkpoint_hit', 'compaction_prepared', 'compaction_committed']) assert.ok(events.some(e => e.event === event), event);
  const commit = events.find(e => e.event === 'compaction_committed');
  assert.equal(commit.reason, 'threshold'); assert.equal(commit.fromExtension, true);
  assert.ok(commit.tokensBefore > 0); assert.ok(commit.projectionTokensAfter > 0);
  assert.ok(commit.durationMs >= 0); assert.ok(commit.latencyMs > 0);
  assert.equal(events.some(e => e.event === 'native_fallback'), false);
});
