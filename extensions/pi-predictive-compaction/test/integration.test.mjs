import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sdk as unbundled, root, history, assistant, zeroUsage } from './helpers.mjs';
import { registerPredictiveCompaction } from '../src/extension.mjs';
import { captureView } from '../src/host.mjs';

// No test needs real credentials or an outbound connection.
globalThis.fetch = () => { throw new Error('Offline acceptance forbids network'); };
globalThis.WebSocket = class { constructor() { throw new Error('Offline acceptance forbids WebSocket'); } };
process.env.PI_TELEMETRY = '0';
const bundled = await import(pathToFileURL(join(root, 'dist/bundle/index.js')));

for (const [name, sdk] of [['SDK', unbundled], ['bundled CLI SDK', bundled]]) test(`${name}: native compaction commits the cached cut, keeps the tail, and counts Luna once`, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'predictive-integration-'));
  const preferencesPath = join(directory, 'predictive.json');
  const settingsManager = sdk.SettingsManager.inMemory({ defaultTools: [], compaction: { enabled: true }, retry: { enabled: false }, cacheWarming: 'off', enableAnalytics: false });
  const runtime = await sdk.ModelRuntime.create({ authPath: join(directory, 'empty-auth.json'), modelsPath: null, modelsStorePath: join(directory, 'empty-models.json'), allowModelNetwork: false, refreshOnCreate: false });
  await runtime.setRuntimeApiKey('openai', 'OFFLINE_TEST_VALUE');
  const model = runtime.getModel('openai', 'gpt-6.1-sol'); assert.ok(model);
  let engine, calls = 0, nativeCalls = 0;
  const loader = new sdk.DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [pi => { engine = registerPredictiveCompaction(pi, sdk, { preferencesPath, telemetryDirectory: join(directory, 'logs'), intervalMs: 60000 }); }] });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const manager = sdk.SessionManager.inMemory(directory); const current = history(manager);
  const { session } = await sdk.createAgentSession({ cwd: directory, agentDir: directory, modelRuntime: runtime, model, resourceLoader: loader, settingsManager, sessionManager: manager, tools: [] });
  try {
    const notifications = [];
    await session.bindExtensions({ uiContext: { notify: (...args) => notifications.push(args), setStatus: () => {} } });
    const ctx = session.extensionRunner.createContext();
    assert.deepEqual(ctx.getCompactionSettings(), settingsManager.getCompactionSettings(model));
    const recorder = ctx.createUsageRecorder();
    recorder('test-no-charge', 'openai', 'test', zeroUsage(), 'bound writer');
    assert.equal(manager.getEntries().at(-1).type, 'usage');
    runtime.streamSimple = (m, _c, o) => ({ result: async () => {
      if (m.id === 'gpt-6-luna') { assert.equal(o.reasoning, 'medium'); ++calls; }
      else { assert.equal(m.id, model.id); ++nativeCalls; }
      return assistant('## Goal\nContinue the edit.\n## Next Steps\nRun the focused check.', { model: m.id, usage: { ...zeroUsage(), input: 100, output: 20, totalTokens: 120 } });
    } });
    await session.prompt('/predictive-compaction on'); assert.equal(engine.enabled, true, JSON.stringify(notifications)); assert.equal(calls, 0);
    const originalModel = session.model;
    // Observe at a complete active boundary with a controlled near-threshold usage estimate.
    const live = captureView(sdk, ctx, ctx.getSystemPrompt());
    engine.observe({ ...live, tokens: model.contextWindow - live.settings.reserveTokens - 1 }, { active: true });
    await engine.active.promise;
    assert.equal(engine.status().phase, 'ready');
    const cut = engine.ready.snapshot.cutId, preparedCalls = calls;
    manager.appendMessage({ role: 'user', content: 'TAIL: approval is scoped to this one edit only.', timestamp: 3 });
    manager.appendMessage(assistant('TAIL: now editing the call site.'));
    const result = await session.compact();
    assert.equal(result.firstKeptEntryId, cut); assert.equal(calls, preparedCalls); assert.equal(session.model, originalModel);
    const projection = manager.buildSessionProjection();
    assert.ok(projection.entries.some(e => e.sourceEntry.id === current));
    assert.ok(JSON.stringify(projection.messages).includes('TAIL: approval is scoped to this one edit only.'));
    const usage = manager.getEntries().filter(e => e.type === 'usage' && e.kind === 'predictive_compaction');
    assert.equal(usage.length, calls); assert.equal(usage.reduce((n, e) => n + e.usage.totalTokens, 0), calls * 120);
    const compacted = manager.getEntries().findLast(e => e.type === 'compaction');
    assert.equal(compacted.usage, undefined); assert.equal(compacted.fromHook, true);
    assert.ok(compacted.summary.includes('Approval applies once only.\r\n'));
    const protectedStep = 'OVERSIZED CURRENT STEP ' + 'x'.repeat(Math.ceil(model.contextWindow * 4));
    manager.appendMessage({ role: 'user', content: protectedStep, timestamp: Date.now() });
    const beforeRefusal = manager.getEntries().filter(e => e.type === 'compaction').length;
    // An irreducible protected request is a predictive error and authorizes warned native fallback.
    const refused = await session.extensionRunner.emit({ type: 'session_before_compact', reason: 'threshold', signal: new AbortController().signal });
    assert.equal(refused, undefined);
    assert.equal(engine.status().lastFailure, 'budget');
    assert.ok(notifications.some(([text]) => /Using Pi native compaction: predictive failure \(budget\)/i.test(text)));
    await session.extensionRunner.emit({ type: 'session_compact_failed', reason: 'threshold', aborted: true });
    assert.equal(manager.getEntries().filter(e => e.type === 'compaction').length, beforeRefusal);
    assert.ok(manager.buildSessionProjection().messages.some(m => m.content === protectedStep));
    assert.match(engine.status().lastError, /headroom requirement/);
    const recovered = await session.compact('Keep the current editing goal.');
    assert.ok(recovered.summary.trim());
    assert.ok(nativeCalls > 0, 'manual recovery reaches Pi native compaction instead of repeated extension cancellation');
    assert.equal(manager.getEntries().filter(e => e.type === 'compaction').length, beforeRefusal + 1);
    assert.equal(manager.getEntries().findLast(e => e.type === 'compaction').fromHook, false);
    assert.notEqual(engine.status().phase, 'handoff');
    assert.ok(notifications.some(([text]) => /native compaction/i.test(text)));
    await session.prompt('/predictive-compaction off'); assert.equal(engine.enabled, false);
  } finally {
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    session.dispose();
  }
});

test('both native loaders discover the actual TypeScript extension and its controls without starting work', async () => {
  for (const sdk of [unbundled, bundled]) {
    const directory = mkdtempSync(join(tmpdir(), 'predictive-discovery-'));
    const settingsManager = sdk.SettingsManager.inMemory({ enableAnalytics: false });
    const loader = new sdk.DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, additionalExtensionPaths: [resolve('index.ts')] });
    await loader.reload();
    const loaded = loader.getExtensions();
    assert.deepEqual(loaded.errors, []);
    assert.ok(loaded.extensions.some(e => e.commands.has('predictive-compaction')));
  }
});
