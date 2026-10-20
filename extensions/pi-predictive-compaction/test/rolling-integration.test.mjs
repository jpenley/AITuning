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

const bundled = await import(pathToFileURL(join(root, 'dist/bundle/index.js')));
const ai = findPackageJSON('@earendil-works/pi-ai', pathToFileURL(join(root, 'dist/index.js')));
const { createAssistantMessageEventStream } = await import(pathToFileURL(join(dirname(ai), 'dist/utils/event-stream.js')));
globalThis.fetch = () => { throw new Error('Offline rolling integration forbids network'); };

// Break caught: a long uninterrupted user step must not need native compaction to move its cut.
for (const [name, sdk] of [['SDK', unbundled], ['bundled SDK', bundled]]) for (const failContinuation of [false, true]) test(`${name}: ${failContinuation ? 'a failed native continuation cannot inherit an earlier successful settlement' : 'one uninterrupted step exceeds a context window through rolling predictive commits'}`, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'predictive-long-step-'));
  const preferencesPath = join(directory, 'preferences.json'); writePreferences(preferencesPath, true);
  const settingsManager = sdk.SettingsManager.inMemory({ defaultTools: [], compaction: { enabled: true, keepRecentTokens: 5000 }, retry: { enabled: false }, cacheWarming: 'off', enableAnalytics: false });
  const runtime = await sdk.ModelRuntime.create({ authPath: join(directory, 'auth.json'), modelsPath: null, modelsStorePath: join(directory, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  await runtime.setRuntimeApiKey('openai', 'OFFLINE_TEST_VALUE');
  const model = { ...runtime.getModel('openai', 'gpt-6.1-sol'), contextWindow: 100000 };
  let engine, lunaCalls = 0, nativeCalls = 0, foregroundCalls = 0, toolCalls = 0, generatedTokens = 0;
  let summariesFail = false, continued = false, consolidationCalls = 0, starts = 0;
  const outcomes = [], settlements = [];
  runtime.streamSimple = (m) => ({ result: async () => {
    if (m.id === 'gpt-6-luna') ++lunaCalls; else ++nativeCalls;
    if (summariesFail) {
      if (engine.active?.snapshot.consolidated) ++consolidationCalls;
      throw new Error('Controlled compaction failure in the final continuation');
    }
    return assistant('## Goal\nContinue the single API step.\n## Progress\nCompleted earlier tool groups.\n## Next Steps\nContinue the remaining work.', { model: m.id, usage: { ...zeroUsage(), input: 100, output: 20, totalTokens: 120 } });
  } });
  const loader = new sdk.DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [pi => {
      engine = registerPredictiveCompaction(pi, sdk, { preferencesPath, telemetryDirectory: join(directory, 'logs'), intervalMs: 60000, consolidateOnSettle: failContinuation });
      if (failContinuation) {
        pi.on('agent_start', () => { ++starts; });
        pi.on('agent_settled', event => { settlements.push(event.aborted); });
        pi.on('agent_before_settle', event => {
          outcomes.push(event.outcome);
          if (continued || event.outcome !== 'completed') return;
          continued = true; summariesFail = true;
          return { continue: true, entries: [{ type: 'custom_message', customType: 'offline-continuation', display: false, content: 'Continuation evidence '.repeat(22000) }] };
        });
      }
    }] });
  await loader.reload();
  const manager = sdk.SessionManager.inMemory(directory); history(manager, 2);
  manager.appendMessage(assistant('Initial usage', { usage: { ...zeroUsage(), input: 10000, totalTokens: 10000 } }));
  const { session } = await sdk.createAgentSession({ cwd: directory, agentDir: directory, modelRuntime: runtime, model, thinkingLevel: 'medium', resourceLoader: loader, settingsManager, sessionManager: manager, tools: ['work'], customTools: [{
    name: 'work', label: 'Work', description: 'Produce one closed group of execution evidence', parameters: { type: 'object', properties: {} },
    execute: async () => {
      ++toolCalls;
      const result = { role: 'toolResult', toolCallId: `work-${toolCalls}`, toolName: 'work', content: [{ type: 'text', text: `Evidence ${toolCalls}: ` + 'x'.repeat(40000) }], isError: false, timestamp: Date.now() };
      generatedTokens += sdk.estimateTokens(result);
      return { content: result.content, details: {} };
    },
  }] });
  const request = 'Complete the entire API step without pausing. Do not publish; approval applies only to this step. café 🛠️';
  try {
    await session.bindExtensions({});
    const extensionContext = session.extensionRunner.createContext();
    session.agent.streamFunction = (_m, context) => {
      if (summariesFail) {
        ++nativeCalls;
        const failed = createAssistantMessageEventStream();
        const message = assistant('', { stopReason: 'error', errorMessage: 'Controlled native compaction failure' });
        queueMicrotask(() => { failed.push({ type: 'error', reason: 'error', error: message }); });
        return failed;
      }
      ++foregroundCalls;
      assert.ok(JSON.stringify(context.messages).includes(request), 'Exact request survives even after its raw entry is compacted');
      const more = foregroundCalls <= 20;
      const inputTokens = manager.buildSessionProjection().messages.reduce((n, m) => n + sdk.estimateTokens(m), 0) + Math.ceil(extensionContext.getSystemPrompt().length / 4);
      const message = assistant(more ? '' : 'Final answer: all work groups are complete.', { timestamp: Date.now(), stopReason: more ? 'toolUse' : 'stop',
        content: more ? [{ type: 'toolCall', id: `work-${foregroundCalls}`, name: 'work', arguments: {} }] : [{ type: 'text', text: 'Final answer: all work groups are complete.' }],
        usage: { ...zeroUsage(), input: inputTokens, totalTokens: inputTokens } });
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => { stream.push({ type: 'start', partial: message }); stream.push({ type: 'done', reason: message.stopReason, message }); });
      return stream;
    };
    await session.prompt(request);
    assert.equal(toolCalls, 20, JSON.stringify({ status: engine.status(), nativeCalls, foregroundCalls })); assert.equal(foregroundCalls, 21);
    assert.ok(generatedTokens > model.contextWindow);
    assert.ok(lunaCalls > 1);
    if (failContinuation) {
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      await engine.active?.promise;
      assert.equal(continued, true); assert.equal(starts, 2);
      assert.deepEqual(outcomes, ['completed', 'error'], 'Native failure must publish a fresh error outcome instead of inheriting completed');
      assert.deepEqual(settlements, [false], 'A native failure is not a user abort');
      assert.equal(consolidationCalls, 0, 'A failed final continuation must not launch optional Luna work');
    } else assert.equal(nativeCalls, 0);
    const commits = manager.getEntries().filter(e => e.type === 'compaction');
    assert.ok(commits.length >= 2, JSON.stringify(engine.status()));
    assert.ok(commits.every(e => e.fromHook));
    const rolling = commits.filter(e => e.details?.predictive?.rolling);
    assert.ok(rolling.length >= 2);
    assert.equal(new Set(rolling.map(e => e.details.predictive.stepId)).size, 1);
    assert.equal(rolling[0].details.predictive.stepId, manager.getEntries().find(e => e.type === 'message' && e.message.role === 'user' && JSON.stringify(e.message.content).includes(request)).id);
    assert.equal(new Set(rolling.map(e => e.firstKeptEntryId)).size, rolling.length);
    const messages = manager.buildSessionProjection().messages;
    const calls = new Set(messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(b => b.type === 'toolCall').map(b => b.id) : []));
    for (const message of messages) if (message.role === 'toolResult') assert.ok(calls.has(message.toolCallId));
    assert.ok(JSON.stringify(messages).includes(request));
  } finally { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); }
});
