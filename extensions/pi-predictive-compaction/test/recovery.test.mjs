import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sdk as unbundled, root, history, assistant, zeroUsage } from './helpers.mjs';
import { registerPredictiveCompaction } from '../src/extension.mjs';
import { captureView } from '../src/host.mjs';

globalThis.fetch = () => { throw new Error('Offline recovery test forbids network'); };
process.env.PI_TELEMETRY = '0';
const bundled = await import(pathToFileURL(join(root, 'dist/bundle/index.js')));

for (const [name, sdk] of [['SDK', unbundled], ['bundled CLI SDK', bundled]]) test(`${name}: manual recovery does not wait for a stuck speculative provider and accounts for its late response`, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'predictive-recovery-'));
  const settingsManager = sdk.SettingsManager.inMemory({ defaultTools: [], retry: { enabled: false }, cacheWarming: 'off', enableAnalytics: false });
  const runtime = await sdk.ModelRuntime.create({ authPath: join(directory, 'empty-auth.json'), modelsPath: null, modelsStorePath: join(directory, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  await runtime.setRuntimeApiKey('openai', 'OFFLINE_TEST_VALUE');
  const model = runtime.getModel('openai', 'gpt-6.1-sol');
  let engine, release, requestSignal, nativeCalls = 0, started;
  const requestStarted = new Promise(resolve => { started = resolve; });
  runtime.streamSimple = (m, _c, options) => ({ result: () => {
    if (m.id === 'gpt-6-luna') {
      requestSignal = options.signal; started();
      return new Promise(resolve => { release = () => resolve(assistant('Late speculative summary', { model: m.id, usage: { ...zeroUsage(), input: 500, output: 20, totalTokens: 520 } })); });
    }
    ++nativeCalls;
    return Promise.resolve(assistant('## Goal\nRecover the edit.\n## Next Steps\nContinue safely.', { model: m.id }));
  } });
  const loader = new sdk.DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [pi => { engine = registerPredictiveCompaction(pi, sdk, { preferencesPath: join(directory, 'preferences.json'), telemetryDirectory: join(directory, 'logs'), intervalMs: 60000 }); }] });
  await loader.reload();
  const manager = sdk.SessionManager.inMemory(directory); history(manager);
  const { session } = await sdk.createAgentSession({ cwd: directory, agentDir: directory, modelRuntime: runtime, model, resourceLoader: loader, settingsManager, sessionManager: manager, tools: [] });
  try {
    await session.bindExtensions({}); await session.prompt('/predictive-compaction on');
    const ctx = session.extensionRunner.createContext();
    const job = engine.start(captureView(sdk, ctx, ctx.getSystemPrompt()).snapshot());
    await requestStarted;
    const recovered = await session.compact('Retain the edit goal.');
    assert.ok(recovered.summary.includes('Recover the edit'));
    assert.ok(nativeCalls > 0); assert.equal(requestSignal.aborted, true);
    assert.notEqual(engine.status().phase, 'handoff');
    release(); await job.promise;
    assert.equal(engine.ready, undefined);
    assert.equal(manager.getEntries().filter(e => e.type === 'compaction').length, 1);
    assert.equal(manager.getEntries().filter(e => e.type === 'usage' && e.kind === 'predictive_compaction').length, 1);
  } finally {
    release?.();
    if (engine.active) await engine.active.promise;
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose();
  }
  const events = readdirSync(join(directory, 'logs', manager.getSessionId())).flatMap(file => readFileSync(join(directory, 'logs', manager.getSessionId(), file), 'utf8').trim().split('\n').map(JSON.parse));
  assert.ok(events.some(e => e.event === 'native_fallback' && e.reason === 'manual'));
  assert.ok(events.some(e => e.event === 'compaction_committed' && e.fromExtension === false));
  assert.ok(events.some(e => e.event === 'provider_call_finished' && e.totalTokens === 520 && e.outcome === 'aborted'));
  assert.ok(events.some(e => e.event === 'job_discarded'));
});
