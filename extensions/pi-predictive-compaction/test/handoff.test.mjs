import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findPackageJSON } from 'node:module';
import { sdk as unbundled, root, history, assistant, zeroUsage } from './helpers.mjs';
import { registerPredictiveCompaction } from '../src/extension.mjs';
import { writePreferences } from '../src/preferences.mjs';
import { captureView } from '../src/host.mjs';
import { assessCompaction } from '../src/budget.mjs';

const bundled = await import(pathToFileURL(join(root, 'dist/bundle/index.js')));
const aiPackage = findPackageJSON('@earendil-works/pi-ai', pathToFileURL(join(root, 'dist/index.js')));
const { createAssistantMessageEventStream } = await import(pathToFileURL(join(dirname(aiPackage), 'dist/utils/event-stream.js')));
globalThis.fetch = () => { throw new Error('Offline test forbids network'); };
process.env.PI_TELEMETRY = '0';

function stream(message) {
  const result = createAssistantMessageEventStream();
  queueMicrotask(() => { result.push({ type: 'start', partial: message }); result.push({ type: 'done', reason: message.stopReason, message }); });
  return result;
}

async function fixture(sdk, { tokens, enabled = true, nativeFails = false, autoEnabled = true, oversizedNative = false, crossesDuringResponse = false, stuckPredictor = false, virtualRouting = false, holdRoute = false, previousSmall = false, recoverySmall = false, crossUsage = 90000, blockWork = false, cancelNative = false, overflowResponse = false, foregroundTokens = 10000, readySummary, routeReserveTokens } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'predictive-handoff-'));
  const preferencesPath = join(directory, 'preferences.json'); writePreferences(preferencesPath, enabled);
  const settingsManager = sdk.SettingsManager.inMemory({ defaultTools: [], compaction: { enabled: autoEnabled, keepRecentTokens: stuckPredictor ? 1000 : 20000, modelOverrides: routeReserveTokens === undefined ? undefined : { 'offline-routing/small': { reserveTokens: routeReserveTokens } } }, retry: { enabled: false }, cacheWarming: 'off', enableAnalytics: false });
  const runtime = await sdk.ModelRuntime.create({ authPath: join(directory, 'auth.json'), modelsPath: null, modelsStorePath: join(directory, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  await runtime.setRuntimeApiKey('openai', 'OFFLINE_TEST_VALUE');
  let routeEntered, releaseRoute;
  const routeStarted = new Promise(resolve => { routeEntered = resolve; });
  if (virtualRouting) {
    await runtime.setRuntimeApiKey('offline-router', 'OFFLINE_TEST_VALUE');
    runtime.registerProvider('offline-routing', { api: 'openai-responses', baseUrl: 'https://offline.invalid', apiKey: 'OFFLINE_TEST_VALUE', models: [{
      id: 'small', name: 'Small offline model', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 16384,
    }] });
    runtime.registerVirtualModel({ provider: 'offline-router', id: 'auto', name: 'Offline router', contextWindow: 272000, maxTokens: 16384,
      route: async request => {
        if (holdRoute && request.reason !== 'direct') {
          routeEntered(); await new Promise(resolve => { releaseRoute = resolve; });
        }
        return { model: runtime.getModel('offline-routing', 'small'), thinkingLevel: 'off' };
      },
    });
    runtime.registerVirtualModel({ provider: 'offline-router', id: 'recovery', name: 'Explicit recovery router', contextWindow: 272000, maxTokens: 16384,
      route: async () => ({ model: runtime.getModel(recoverySmall ? 'offline-routing' : 'openai', recoverySmall ? 'small' : 'gpt-6.1-sol'), thinkingLevel: 'off' }),
    });
  }
  const model = virtualRouting ? runtime.getModel('offline-router', 'auto') : { ...runtime.getModel('openai', 'gpt-6.1-sol'), contextWindow: 100000 };
  let engine, nativeCalls = 0, foregroundCalls = 0, toolCalls = 0;
  // Mock only the speculative provider; native compaction and lifecycle stay real.
  let predictorSignal, releasePredictor;
  runtime.streamSimple = (_m, _c, options) => ({ result: async () => {
    if (readySummary) return assistant(readySummary, { model: 'gpt-6-luna' });
    if (!stuckPredictor) throw new Error('Predictor unavailable');
    predictorSignal = options.signal;
    return new Promise(resolve => { releasePredictor = () => resolve(assistant('Late checkpoint', { model: 'gpt-6-luna' })); });
  } });
  const loader = new sdk.DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [pi => {
      engine = registerPredictiveCompaction(pi, sdk, { preferencesPath, telemetryDirectory: join(directory, 'logs'), intervalMs: 60000, consolidateOnSettle: false });
      if (blockWork) pi.on('tool_call', () => ({ block: true, reason: 'Existing permission policy' }));
      if (cancelNative) pi.on('session_before_compact', () => ({ cancel: true }));
    }] });
  await loader.reload();
  const manager = sdk.SessionManager.inMemory(directory); history(manager, stuckPredictor || virtualRouting ? 12 : 4);
  manager.appendMessage(assistant('Recorded context', { timestamp: Date.now() - 1000, provider: previousSmall ? 'offline-routing' : 'openai', model: previousSmall ? 'small' : 'gpt-6.1-sol', usage: { ...zeroUsage(), input: tokens, totalTokens: tokens } }));
  const { session } = await sdk.createAgentSession({ cwd: directory, agentDir: directory, modelRuntime: runtime, model, thinkingLevel: 'medium', resourceLoader: loader, settingsManager, sessionManager: manager, tools: ['work'], customTools: [{
    name: 'work', label: 'Work', description: 'Count admitted work', parameters: { type: 'object', properties: {} },
    execute: async () => { ++toolCalls; return { content: [{ type: 'text', text: 'work result' }], details: {} }; },
  }] });
  await session.bindExtensions({});
  session.agent.streamFunction = (_model, context) => {
    const native = context.messages.some(m => typeof m.content === 'string' && /summar/i.test(m.content));
    if (native) {
      ++nativeCalls;
      return stream(assistant(nativeFails ? '' : oversizedNative ? 'x'.repeat(340000) : '## Goal\nContinue work.\n## Next Steps\nFinish the current task.', { provider: _model.provider, model: _model.id, timestamp: Date.now(), stopReason: nativeFails ? 'error' : 'stop', errorMessage: nativeFails ? 'Native unavailable' : undefined }));
    }
    ++foregroundCalls;
    if (overflowResponse && foregroundCalls === 1) return stream(assistant('', { provider: _model.provider, model: _model.id, stopReason: 'error', errorMessage: 'context_length_exceeded: maximum context length exceeded', timestamp: Date.now() }));
    if (crossesDuringResponse && foregroundCalls === 1) return stream(assistant('', {
      timestamp: Date.now(), stopReason: 'toolUse', usage: { ...zeroUsage(), input: crossUsage, totalTokens: crossUsage },
      content: [{ type: 'toolCall', id: 'crossing-work', name: 'work', arguments: {} }],
    }));
    return stream(assistant('Done', { provider: _model.provider, model: _model.id, timestamp: Date.now(), usage: { ...zeroUsage(), input: foregroundTokens, totalTokens: foregroundTokens } }));
  };
  return { session, manager, engine, recoveryModel: virtualRouting ? runtime.getModel('offline-router', 'recovery') : undefined, counts: () => ({ nativeCalls, foregroundCalls, toolCalls }), predictorSignal: () => predictorSignal, releasePredictor: () => releasePredictor?.(), routeStarted, releaseRoute: () => releaseRoute?.(),
    close: async () => {
      await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
      releasePredictor?.(); if (engine.active) await engine.active.promise;
      session.dispose();
    } };
}

for (const [name, sdk] of [['SDK', unbundled], ['bundled SDK', bundled]]) {
  // Break caught: predictive support must not revive the retired 79%/80% admission gates.
  for (const tokens of [79000, 80000, 83000]) test(`${name}: ${tokens} tokens do not force compaction before the native reserve`, async () => {
    const f = await fixture(sdk, { tokens });
    try {
      await f.session.prompt('Continue');
      assert.deepEqual(f.counts(), { nativeCalls: 0, foregroundCalls: 1, toolCalls: 0 });
      assert.equal(f.manager.getEntries().filter(e => e.type === 'compaction').length, 0);
    } finally { await f.close(); }
  });

  test(`${name}: native threshold falls through immediately when no predictive checkpoint is ready`, async () => {
    const f = await fixture(sdk, { tokens: 90000 });
    try {
      await f.session.prompt('Continue');
      assert.ok(f.counts().nativeCalls >= 1); assert.equal(f.counts().foregroundCalls, 1);
      assert.equal(f.manager.getEntries().findLast(e => e.type === 'compaction').fromHook, false);
      assert.equal(f.engine.metrics.blocking, 0); assert.equal(f.engine.metrics.waits, 0);
    } finally { await f.close(); }
  });

  test(`${name}: disabling native automatic compaction removes automatic triggering even at 99%`, async () => {
    const f = await fixture(sdk, { tokens: 99000, autoEnabled: false });
    try {
      await f.session.prompt('Continue');
      assert.deepEqual(f.counts(), { nativeCalls: 0, foregroundCalls: 1, toolCalls: 0 });
      assert.equal(f.manager.getEntries().filter(e => e.type === 'compaction').length, 0);
    } finally { await f.close(); }
  });

  // Break caught: a failed native attempt must not create a predictive latch or native-call quota.
  test(`${name}: native failure leaves subsequent native triggers and foreground processing in charge`, async () => {
    const f = await fixture(sdk, { tokens: 90000, nativeFails: true, foregroundTokens: 90000 });
    try {
      await f.session.prompt('Continue');
      const first = f.counts().nativeCalls; assert.ok(first >= 1);
      await f.session.prompt('Try another ordinary native trigger');
      assert.ok(f.counts().nativeCalls > first); assert.equal(f.counts().foregroundCalls, 2);
      assert.equal(f.manager.getEntries().filter(e => e.type === 'compaction').length, 0);
    } finally { await f.close(); }
  });

  // Break caught: a ready checkpoint must fit the new physical route, not the previous response model.
  for (const [label, tokens, size, routeReserveTokens] of [['smaller window', 210000, 120000, undefined], ['physical reserve override', 150000, 100000, 40000]]) test(`${name}: ready checkpoint respects newly routed ${label}`, async () => {
    const f = await fixture(sdk, { tokens, virtualRouting: true, readySummary: 'S'.repeat(size), routeReserveTokens });
    try {
      const ctx = f.session.extensionRunner.createContext(), view = captureView(sdk, ctx, ctx.getSystemPrompt());
      await f.engine.start(view.snapshot()).promise;
      assert.ok(f.engine.ready, 'a real ready checkpoint must exist before routing');
      const packet = f.engine.finalize(f.engine.ready, view);
      assert.equal(assessCompaction(packet, view).accepted, true, 'the checkpoint must be usable under the previous model');
      if (routeReserveTokens === undefined) assert.ok(packet.tokensAfter > 100000);
      await f.session.prompt('Continue on the newly routed physical model');
      assert.ok(f.counts().nativeCalls >= 1, 'reject the oversized prediction and immediately use native compaction');
      assert.equal(f.engine.metrics.started, 1); assert.equal(f.engine.metrics.waits, 0); assert.equal(f.engine.metrics.blocking, 0);
      const commits = f.manager.getEntries().filter(e => e.type === 'compaction');
      assert.ok(commits.length >= 1); assert.ok(commits.every(e => !e.fromHook));
    } finally { await f.close(); }
  });

  test(`${name}: the native routed-model threshold remains reachable`, async () => {
    const f = await fixture(sdk, { tokens: 90000, virtualRouting: true });
    try {
      await f.session.prompt('Route to the smaller model');
      assert.ok(f.counts().nativeCalls >= 1); assert.equal(f.counts().foregroundCalls, 1);
      assert.equal(f.manager.getEntries().findLast(e => e.type === 'compaction').fromHook, false);
    } finally { await f.close(); }
  });

  // Break caught: aborting a router must not authorize new inference or compaction.
  test(`${name}: cancellation during routing starts no compaction or foreground request`, async () => {
    const f = await fixture(sdk, { tokens: 80000, virtualRouting: true, holdRoute: true });
    try {
      const running = f.session.prompt('Route to the smaller model');
      await f.routeStarted; const aborted = f.session.abort(); f.releaseRoute();
      await Promise.allSettled([running, aborted]);
      assert.deepEqual(f.counts(), { nativeCalls: 0, foregroundCalls: 0, toolCalls: 0 });
      assert.equal(f.manager.getEntries().filter(e => e.type === 'compaction').length, 0);
    } finally { f.releaseRoute(); await f.close(); }
  });

  // Break caught: removing the gate must not remove normal tool completion and next-turn compaction.
  for (const [crossUsage, compacts] of [[80000, false], [90000, true]]) test(`${name}: tools execute before the native ${crossUsage}-token between-turn check`, async () => {
    const f = await fixture(sdk, { tokens: 60000, crossesDuringResponse: true, crossUsage });
    try {
      await f.session.prompt('Run the work tool');
      assert.equal(f.counts().toolCalls, 1); assert.equal(f.counts().foregroundCalls, 2);
      assert.equal(f.counts().nativeCalls > 0, compacts);
      const result = f.manager.buildSessionProjection().messages.find(m => m.role === 'toolResult' && m.toolCallId === 'crossing-work');
      assert.ok(result); assert.notEqual(result.isError, true);
    } finally { await f.close(); }
  });

  test(`${name}: removing predictive admission gates preserves another extension's tool permission block`, async () => {
    const f = await fixture(sdk, { tokens: 60000, crossesDuringResponse: true, blockWork: true });
    try {
      await f.session.prompt('Run the work tool'); assert.equal(f.counts().toolCalls, 0);
      const result = f.manager.buildSessionProjection().messages.find(m => m.role === 'toolResult' && m.toolCallId === 'crossing-work');
      assert.equal(result?.isError, true); assert.match(JSON.stringify(result.content), /Existing permission policy/);
    } finally { await f.close(); }
  });

  test(`${name}: a native trigger never waits for a stuck predictive provider`, async () => {
    const f = await fixture(sdk, { tokens: 90000, stuckPredictor: true });
    try {
      const ctx = f.session.extensionRunner.createContext();
      const job = f.engine.start(captureView(sdk, ctx, ctx.getSystemPrompt()).snapshot());
      while (!f.predictorSignal()) await new Promise(resolve => setImmediate(resolve));
      await f.session.prompt('Continue through native fallback');
      assert.equal(f.predictorSignal().aborted, true);
      assert.ok(f.counts().nativeCalls >= 1); assert.equal(f.counts().foregroundCalls, 1);
      assert.equal(f.manager.getEntries().findLast(e => e.type === 'compaction').fromHook, false);
      assert.equal(f.engine.metrics.waits, 0); assert.equal(f.engine.metrics.blocking, 0);
      f.releasePredictor(); await job.promise;
      for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(f.engine.ready, undefined);
      assert.equal(f.manager.getEntries().filter(e => e.type === 'usage' && e.kind === 'predictive_compaction').length, 1);
    } finally { await f.close(); }
  });

  test(`${name}: another compaction hook can still cancel native fallback`, async () => {
    const f = await fixture(sdk, { tokens: 90000, cancelNative: true });
    try {
      await f.session.prompt('Continue');
      assert.equal(f.counts().nativeCalls, 0); assert.equal(f.engine.consuming, false);
      assert.equal(f.manager.getEntries().filter(e => e.type === 'compaction').length, 0);
    } finally { await f.close(); }
  });

  test(`${name}: native overflow recovery is not suppressed by predictive support`, async () => {
    const f = await fixture(sdk, { tokens: 60000, overflowResponse: true });
    try {
      await f.session.prompt('Continue with overflow recovery');
      assert.ok(f.counts().nativeCalls >= 1); assert.equal(f.counts().foregroundCalls, 2);
      assert.equal(f.manager.getEntries().findLast(e => e.type === 'compaction').fromHook, false);
      assert.ok(f.manager.getEntries().some(e => e.type === 'context_edit'));
    } finally { await f.close(); }
  });

  test(`${name}: predictive off leaves ordinary native compaction available`, async () => {
    const f = await fixture(sdk, { tokens: 90000, enabled: false });
    try {
      await f.session.prompt('Continue');
      assert.ok(f.counts().nativeCalls >= 1); assert.equal(f.counts().foregroundCalls, 1);
      assert.equal(f.manager.getEntries().findLast(e => e.type === 'compaction').fromHook, false);
    } finally { await f.close(); }
  });
}
