import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findPackageJSON } from 'node:module';

assert.ok(process.env.PI_TASK_GUARD_SDK_ROOT, 'Set PI_TASK_GUARD_SDK_ROOT to the installed Pi 1.3.0 package directory.');
assert.ok(process.env.PI_TASK_GUARD_TODO_ROOT, 'Set PI_TASK_GUARD_TODO_ROOT to the installed rpiv-todo 2.13.9 package directory.');
const root = process.env.PI_TASK_GUARD_SDK_ROOT;
const sdk = await import(pathToFileURL(join(root, 'dist/index.js')));
const aiPackage = findPackageJSON('@earendil-works/pi-ai', pathToFileURL(join(root, 'dist/index.js')));
const { createAssistantMessageEventStream } = await import(pathToFileURL(join(dirname(aiPackage), 'dist/utils/event-stream.js')));
const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
const call = (name, args) => ({ name, args });
globalThis.fetch = () => { throw new Error('Offline SDK tests forbid network requests.'); };
process.env.PI_TELEMETRY = '0';

async function fixture(script, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'task-guard-sdk-'));
  const settingsManager = sdk.SettingsManager.inMemory({ defaultTools: [], compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: 'off', enableAnalytics: false });
  const runtime = await sdk.ModelRuntime.create({ authPath: join(directory, 'empty-auth.json'), modelsPath: null, modelsStorePath: join(directory, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  await runtime.setRuntimeApiKey('openai', 'OFFLINE_TEST_VALUE');
  const model = runtime.getModel('openai', 'gpt-6.1-sol');
  assert.ok(model);
  const events = sdk.createEventBus(), herdr = [], inputs = [], questionnaires = [];
  events.on('herdr:blocked', report => herdr.push(report));
  events.on('rpiv:ask-user:prompt', prompt => {
    questionnaires.push(prompt);
    if (options.ask) events.emit('rpiv:ask-user:answer', options.cancel ? { toolCallId: prompt.toolCallId, cancel: true } : { toolCallId: prompt.toolCallId, answers: [{ questionIndex: 0, text: 'Use PostgreSQL' }] });
  });
  const extraPaths = [join(extensionRoot, '../pi-herdr-prompts/index.ts')];
  if (options.ask) {
    assert.ok(process.env.PI_TASK_GUARD_ASK_ROOT, 'Set PI_TASK_GUARD_ASK_ROOT to the installed rpiv-ask-user-question package.');
    extraPaths.push(join(process.env.PI_TASK_GUARD_ASK_ROOT, 'index.ts'));
  }
  const loader = new sdk.DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager, eventBus: events, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [join(process.env.PI_TASK_GUARD_TODO_ROOT, 'index.ts'), join(extensionRoot, 'index.ts'), ...extraPaths],
    extensionFactories: [pi => pi.registerTool({
      name: 'nested_todo', label: 'Nested todo', description: 'Exercise real nested tool execution without standalone todo results.',
      parameters: { type: 'object', properties: { action: { type: 'string' }, subject: { type: 'string' }, id: { type: 'number' }, status: { type: 'string' } }, required: ['action'] },
      execute: async (_id, params, signal, _update, ctx) => ctx.executeTool('todo', params, { signal }),
    })],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const renderer = loader.getExtensions().extensions.flatMap(extension => [...extension.entryRenderers.entries()]).find(([type]) => type === 'task-guard-notice')?.[1];
  assert.ok(renderer, 'The installed entry point must register a persistent pause renderer.');
  assert.ok(renderer({ data: { text: 'Paused: approval required\u001b[31m' } }).render(60).join('\n').includes('approval required'));
  assert.ok(!renderer({ data: { text: 'bad\u001b[31m' } }).render(60).join('\n').includes('\u001b'));
  const manager = sdk.SessionManager.inMemory(directory);
  const { session } = await sdk.createAgentSession({ cwd: directory, agentDir: directory, modelRuntime: runtime, model, resourceLoader: loader, settingsManager, sessionManager: manager, tools: ['todo', 'task_blocker', 'nested_todo', ...(options.ask ? ['ask_user_question'] : [])] });
  const errors = [], contexts = [];
  await session.bindExtensions({ onError: error => errors.push(error), ...(options.ui ? { mode: 'tui', uiContext: {
    input: async (...args) => { inputs.push(args); return options.answer; },
    notify: () => {}, setStatus: () => {}, setWidget: () => {},
    custom: () => { throw new Error('Externally answered questionnaire must not mount a TUI.'); },
  } } : {}) });
  await new Promise(resolve => setImmediate(resolve));
  session.agent.streamFunction = (_model, context) => {
    const step = script[contexts.length];
    contexts.push(context);
    assert.notEqual(step, undefined, 'The guard must not issue an unexpected provider request.');
    const tool = typeof step === 'object';
    const content = tool ? [{ type: 'toolCall', id: `call-${contexts.length}`, name: step.name, arguments: step.args }] : [{ type: 'text', text: step }];
    const response = { role: 'assistant', api: 'openai-responses', provider: 'openai', model: 'gpt-6.1-sol', content, stopReason: tool ? 'toolUse' : 'stop', timestamp: Date.now(), usage: usage() };
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => { stream.push({ type: 'start', partial: response }); stream.push({ type: 'done', reason: response.stopReason, message: response }); });
    return stream;
  };
  return { session, manager, errors, contexts, herdr, inputs, questionnaires,
    async close() { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); rmSync(directory, { recursive: true, force: true }); },
  };
}

// Break: a fake host accepts an invalid boundary/schema that real Pi rejects.
test('real Pi and rpiv-todo continue after an early final answer and finish the task', { timeout: 20000 }, async () => {
  const h = await fixture([
    call('todo', { action: 'create', subject: 'Implement the change' }),
    'Here is the plan; stopping prematurely.',
    call('todo', { action: 'update', id: 1, status: 'in_progress' }),
    call('todo', { action: 'update', id: 1, status: 'completed' }),
    'The change is complete.',
  ]);
  try {
    await h.session.prompt('Complete the requested change and track it as a task.');
    assert.equal(h.contexts.length, 5);
    assert.ok(JSON.stringify(h.contexts[2]).includes('Task guard: unfinished work remains'));
    const states = h.manager.getBranch().filter(entry => entry.type === 'custom' && entry.customType === 'rpiv-todo-state');
    assert.equal(states.at(-1).data.tasks[0].status, 'completed');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

// Break: a blocker tool failure is hidden and the provider is silently retried.
test('real blocker tool produces a visible pause reason and no extra provider call', { timeout: 20000 }, async () => {
  const h = await fixture([
    call('todo', { action: 'create', subject: 'Choose the database' }),
    call('task_blocker', { action: 'set', taskIds: [1], kind: 'user_input', reason: 'The database choice is missing', nextAction: 'User: choose PostgreSQL or SQLite' }),
    'Waiting for your choice.',
  ]);
  try {
    await h.session.prompt('Implement storage, but let me choose the database.');
    assert.equal(h.contexts.length, 3);
    const reports = h.manager.getBranch().filter(entry => entry.type === 'custom' && entry.customType === 'task-guard-notice');
    assert.match(reports.at(-1).data.text, /The database choice is missing/);
    assert.match(reports.at(-1).data.text, /User: choose PostgreSQL or SQLite/);
    assert.ok(!JSON.stringify(h.manager.buildSessionProjection().messages).includes('Work paused: all remaining tasks are blocked'), 'Pause reports stay out of provider context.');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

// Break: nested calls bypass tool-result replay and become invisible to the guard.
test('real nested todo calls persist tasks and hit a finite no-progress limit', { timeout: 20000 }, async () => {
  const h = await fixture([call('nested_todo', { action: 'create', subject: 'Finish the nested task' }), 'Not done.', 'Still not done.', 'No progress.', 'Still stuck.']);
  try {
    await h.session.prompt('Finish the task tracked by the nested tool.');
    assert.equal(h.contexts.length, 5);
    assert.equal(h.manager.getBranch().filter(entry => entry.type === 'message' && entry.message.role === 'toolResult' && entry.message.toolName === 'todo').length, 0);
    const reports = h.manager.getBranch().filter(entry => entry.type === 'custom' && entry.customType === 'task-guard-notice');
    assert.match(reports.at(-1).data.text, /safety limit/);
    assert.match(reports.at(-1).data.text, /not an external blocker/);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

// Break: real nested ask-user results never reach the provider or leak the Herdr wait.
for (const ask of [true, false]) {
  test(`real ${ask ? 'ask-user extension' : 'native fallback'} answer is reviewed before work resumes`, { timeout: 20000 }, async () => {
    const h = await fixture([
      call('todo', { action: 'create', subject: 'Choose storage' }),
      call('task_blocker', { action: 'set', taskIds: [1], kind: 'user_input', reason: 'Database choice missing', nextAction: 'User: choose a database' }),
      'Stopping without reviewing the answer.',
      call('task_blocker', { action: 'clear', taskIds: [1] }),
      call('todo', { action: 'update', id: 1, status: 'completed' }),
      'Finished with PostgreSQL.',
    ], { ask, ui: true, answer: 'Use PostgreSQL' });
    try {
      await h.session.prompt('Implement storage; ask me which database to use.');
      assert.equal(h.contexts.length, 6);
      assert.match(JSON.stringify(h.contexts[2]), /Use PostgreSQL/);
      assert.match(JSON.stringify(h.contexts[3]), /Review waiting conditions/);
      assert.equal(h.inputs.length, ask ? 0 : 1);
      assert.equal(h.questionnaires.length, ask ? 1 : 0);
      const blockerResult = h.manager.getBranch().find(entry => entry.type === 'message' && entry.message.role === 'toolResult' && entry.message.toolName === 'task_blocker');
      assert.equal(blockerResult.message.details.blockers.length, 1);
      if (ask) assert.equal(blockerResult.message.nestedCalls.calls[0].name, 'ask_user_question');
      let open = 0;
      for (const report of h.herdr) { open += report.active ? 1 : -1; assert.ok(open >= 0); }
      assert.equal(open, 0);
      assert.ok(h.herdr.some(report => report.label === 'Waiting for external task action' && report.active));
      assert.ok(!JSON.stringify(h.herdr).includes('Database choice missing'));
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
}

// Break: a real questionnaire decline reopens a native popup or clears its blocker.
test('real questionnaire decline leaves the external wait active until shutdown', { timeout: 20000 }, async () => {
  const h = await fixture([
    call('todo', { action: 'create', subject: 'Choose storage' }),
    call('task_blocker', { action: 'set', taskIds: [1], kind: 'user_input', reason: 'Database choice missing', nextAction: 'User: choose' }),
    'Waiting for your choice.',
  ], { ask: true, ui: true, cancel: true });
  try {
    await h.session.prompt('Implement storage after I choose the database.');
    assert.equal(h.contexts.length, 3);
    assert.equal(h.inputs.length, 0);
    assert.equal(h.herdr.reduce((open, report) => open + (report.active ? 1 : -1), 0), 1);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
  assert.equal(h.herdr.reduce((open, report) => open + (report.active ? 1 : -1), 0), 0);
});
