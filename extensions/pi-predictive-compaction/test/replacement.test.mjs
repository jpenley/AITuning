import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sdk, history, assistant, zeroUsage } from './helpers.mjs';
import { registerPredictiveCompaction } from '../src/extension.mjs';
import { captureView } from '../src/host.mjs';

globalThis.fetch = () => { throw new Error('Offline lifecycle test forbids network'); };
process.env.PI_TELEMETRY = '0';

test('supported native session replacement cancels Luna and charges a late response only to its originating session', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'predictive-replacement-'));
  const preferencesPath = join(directory, 'predictive.json'), engines = [];
  const settingsManager = sdk.SettingsManager.inMemory({ defaultTools: [], retry: { enabled: false }, cacheWarming: 'off', enableAnalytics: false });
  const runtime = await sdk.ModelRuntime.create({ authPath: join(directory, 'empty-auth.json'), modelsPath: null, modelsStorePath: join(directory, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  await runtime.setRuntimeApiKey('openai', 'OFFLINE_TEST_VALUE');
  const model = runtime.getModel('openai', 'gpt-6.1-sol');
  let resolveResponse, requestSignal;
  let started;
  const requestStarted = new Promise(resolve => { started = resolve; });
  runtime.streamSimple = (_m, _c, options) => ({ result: () => {
    requestSignal = options.signal;
    started();
    return new Promise(resolve => { resolveResponse = resolve; });
  } });
  const createRuntime = async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
    const services = await sdk.createAgentSessionServices({ cwd, agentDir, settingsManager, modelRuntime: runtime, resourceLoaderOptions: { noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [pi => { engines.push(registerPredictiveCompaction(pi, sdk, { preferencesPath, telemetryDirectory: join(directory, 'logs'), intervalMs: 60000 })); }] } });
    const result = await sdk.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model, tools: [] });
    await result.session.bindExtensions({});
    return { ...result, services, diagnostics: services.diagnostics };
  };
  const original = sdk.SessionManager.inMemory(directory); history(original);
  const owner = await sdk.createAgentSessionRuntime(createRuntime, { cwd: directory, agentDir: directory, sessionManager: original });
  try {
    await owner.session.prompt('/predictive-compaction on');
    const ctx = owner.session.extensionRunner.createContext();
    const engine = engines[0], job = engine.start(captureView(sdk, ctx, ctx.getSystemPrompt()).snapshot());
    await requestStarted;
    assert.equal(requestSignal.aborted, false);
    await owner.newSession();
    assert.notEqual(owner.session.sessionManager, original); assert.equal(requestSignal.aborted, true);
    resolveResponse(assistant('Late unaccepted summary', { model: 'gpt-6-luna', usage: { ...zeroUsage(), input: 500, output: 20, totalTokens: 520 } }));
    await job.promise;
    assert.equal(engine.ready, undefined); assert.equal(engine.enabled, false);
    assert.equal(original.getEntries().filter(e => e.type === 'usage' && e.kind === 'predictive_compaction').length, 1);
    assert.equal(owner.session.sessionManager.getEntries().filter(e => e.type === 'usage').length, 0);
    assert.equal(original.getEntries().filter(e => e.type === 'compaction').length, 0);
  } finally { await owner.dispose(); }
  const events = readdirSync(join(directory, 'logs')).flatMap(id => readdirSync(join(directory, 'logs', id)).flatMap(file => readFileSync(join(directory, 'logs', id, file), 'utf8').trim().split('\n').map(JSON.parse)));
  const response = events.filter(e => e.event === 'provider_call_finished');
  assert.equal(response.length, 1); assert.equal(response[0].sessionId, original.getSessionId());
  assert.equal(response[0].totalTokens, 520); assert.equal(response[0].outcome, 'aborted');
  assert.ok(events.some(e => e.event === 'job_discarded' && e.sessionId === original.getSessionId()));
});
