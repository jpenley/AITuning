import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

assert.ok(process.env.SDK_ROOT, 'SDK_ROOT must name the installed Pi 1.3.0 package root (no skips).');
assert.ok(process.env.RPIV_ROOT, 'RPIV_ROOT must name the installed RPIV 2.13.9 package root (no skips).');
assert.equal(JSON.parse(readFileSync(join(process.env.SDK_ROOT, 'package.json'), 'utf8')).version, '1.3.0');
assert.equal(JSON.parse(readFileSync(join(process.env.RPIV_ROOT, 'package.json'), 'utf8')).version, '2.13.9');
globalThis.fetch = () => { throw new Error('Network forbidden in elicitation tests'); };
const sdk = await import(pathToFileURL(join(process.env.SDK_ROOT, 'dist/index.js')));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = (properties, required = Object.keys(properties)) => ({ server: 'offline-test-server', source: 'native-test', request: { message: 'Choose values', requestedSchema: { type: 'object', properties, required } } });

// Real installed entry points + public registered-tool wrappers and ExtensionToolContext.
// No provider/model runtime, credentials, network, or Pi prototype modifications.
async function fixture(answer, final = 'Accept', mode = 'tui', fault) {
  const cwd = mkdtempSync(join(tmpdir(), 'elicitation-sdk-'));
  const oldConfig = process.env.XDG_CONFIG_HOME, oldProvider = process.env.PI_MCP_ELICITATION_PROVIDER;
  process.env.XDG_CONFIG_HOME = cwd;
  process.env.PI_MCP_ELICITATION_PROVIDER = 'auto';
  const bus = sdk.createEventBus();
  const loader = new sdk.DefaultResourceLoader({ cwd, agentDir: cwd, eventBus: bus,
    settingsManager: sdk.SettingsManager.inMemory({ packages: [], enableAnalytics: false }),
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [join(process.env.RPIV_ROOT, 'index.ts'), join(root, 'index.ts')],
    extensionFactories: [pi => {
      pi.on('tool_call', event => event.toolName === 'ask_user_question' && fault === 'gate' ? { block: true, reason: 'Test permission denial' } : undefined);
      pi.on('tool_result', event => {
        if (event.toolName !== 'ask_user_question') return undefined;
        if (fault === 'partial') return { details: { ...event.details, answers: [], unanswered: [0] } };
        if (fault === 'malformed') return { details: { ...event.details, answers: [{ ...event.details.answers[0], answer: 'forged label' }] } };
        return undefined;
      });
    }],
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  const runner = new sdk.ExtensionRunner(loaded.extensions, loaded.runtime, cwd, sdk.SessionManager.inMemory(cwd), {});
  const registered = runner.getAllRegisteredTools();
  // Local additionalExtensionPaths have top-level provenance. Supply the package-manager
  // metadata for this exact installed entry, whose name/version/path are independently checked.
  const rpiv = registered.find(t => t.definition.name === 'ask_user_question');
  rpiv.sourceInfo = { path: join(process.env.RPIV_ROOT, 'index.ts'), source: 'npm:@juicesharp/rpiv-ask-user-question@2.13.9', scope: 'temporary', origin: 'package' };
  const tools = registered.map(t => sdk.wrapRegisteredTool(t, runner));
  let nested = 0, prompts = 0, dialogs = 0;
  const ids = new Map();
  runner.bindCore({
    getAllTools: () => registered.map(t => ({ ...t.definition, exposure: t.definition.exposure ?? 'direct', sourceInfo: t.sourceInfo })),
    getActiveTools: () => tools.map(t => t.name),
    setActiveTools: () => { throw new Error('Companion must not activate tools'); },
  }, {
    getModel: () => undefined, getScopedModels: () => [], isIdle: () => true, isProjectTrusted: () => true, getSignal: () => undefined,
    hasPendingMessages: () => false, getContextUsage: () => undefined, getSystemPrompt: () => '',
    getCallableTools: () => tools,
    executeTool: async (parent, name, input, options) => {
      nested++;
      const id = `${parent}/${(ids.get(parent) ?? 0) + 1}`; ids.set(parent, (ids.get(parent) ?? 0) + 1);
      const toolCall = { id, name, arguments: input };
      const gate = await runner.emitToolCall({ type: 'tool_call', toolCallId: id, toolName: name, input, parentToolCallId: parent });
      if (gate?.block) return { toolCall, isError: true, result: { content: [{ type: 'text', text: 'Denied' }], details: undefined } };
      const result = await tools.find(t => t.name === name).execute(id, input, options.signal);
      const transformed = await runner.emitToolResult({ type: 'tool_result', toolCallId: id, toolName: name, input, parentToolCallId: parent, ...result, isError: result.isError === true });
      const finalResult = { ...result, ...transformed };
      return { toolCall, result: finalResult, isError: finalResult.isError === true };
    },
  });
  runner.setUIContext({ ...runner.getUIContext(),
    select: async (_title, options) => { dialogs++; return options.includes('Accept') ? final : options[0]; },
    input: async () => { dialogs++; return '0'; },
    custom: async () => { throw new Error('Public answer event must resolve before opening a terminal UI'); },
  }, mode);
  const off = bus.on('rpiv:ask-user:prompt', prompt => { prompts++; answer(bus, prompt); });
  return { runner, tools, stats: () => ({ nested, prompts, dialogs }),
    run: (input, signal) => tools.find(t => t.name === 'mcp_elicitation_v1').execute('native-parent', input, signal),
    async close() {
      off();
      await runner.emit({ type: 'session_shutdown', reason: 'quit' });
      runner.invalidate();
      rmSync(cwd, { recursive: true, force: true });
      if (oldConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = oldConfig;
      if (oldProvider === undefined) delete process.env.PI_MCP_ELICITATION_PROVIDER; else process.env.PI_MCP_ELICITATION_PROVIDER = oldProvider;
    },
  };
}
const answerOptions = (bus, p) => bus.emit('rpiv:ask-user:answer', { toolCallId: p.toolCallId, answers: p.questions.map((q, i) => ({ questionIndex: i, optionIndexes: [1], notes: 'do not forward' })), globalNote: 'do not forward' });

test('real installed RPIV answer events round-trip false, enums and multiselect; only final consent accepts', { timeout: 20000 }, async () => {
  const h = await fixture(answerOptions);
  try {
    const result = await h.run(args({ flag: { type: 'boolean' }, color: { type: 'string', enum: ['red', 'blue'] }, tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } } }));
    assert.deepEqual(result.structuredContent, { action: 'accept', content: { flag: false, color: 'blue', tags: ['b'] } });
    assert.equal(result.details, undefined);
    assert.ok(!JSON.stringify(result.content).includes('blue'));
    assert.ok(!JSON.stringify(result).includes('do not forward'));
    assert.deepEqual(h.stats(), { nested: 1, prompts: 1, dialogs: 1 });
  } finally { await h.close(); }
});

test('real RPIV cancellation never falls back and custom answers fail technically', { timeout: 20000 }, async () => {
  for (const custom of [false, true]) {
    const h = await fixture((bus, p) => bus.emit('rpiv:ask-user:answer', custom ? { toolCallId: p.toolCallId, answers: [{ questionIndex: 0, text: 'C1' }] } : { toolCallId: p.toolCallId, cancel: true }));
    try {
      if (custom) await assert.rejects(h.run(args({ x: { type: 'boolean' } })));
      else assert.deepEqual((await h.run(args({ x: { type: 'boolean' } }))).structuredContent, { action: 'cancel' });
      assert.deepEqual(h.stats(), { nested: 1, prompts: 1, dialogs: 0 });
    } finally { await h.close(); }
  }
});

test('real RPIV abort cancels by nested ID and unwinds before returning', { timeout: 20000 }, async () => {
  const controller = new AbortController();
  const h = await fixture(() => controller.abort());
  try {
    assert.deepEqual((await h.run(args({ x: { type: 'boolean' } }), controller.signal)).structuredContent, { action: 'cancel' });
    assert.deepEqual(h.stats(), { nested: 1, prompts: 1, dialogs: 0 });
  } finally { await h.close(); }
});

test('real registered permission/result hooks cannot cause fallback or acceptance', { timeout: 20000 }, async () => {
  for (const fault of ['gate', 'partial', 'malformed']) {
    const h = await fixture(answerOptions, 'Accept', 'tui', fault);
    try {
      await assert.rejects(h.run(args({ x: { type: 'boolean' } })));
      assert.deepEqual(h.stats(), { nested: 1, prompts: fault === 'gate' ? 0 : 1, dialogs: 0 });
    } finally { await h.close(); }
  }
});

test('real RPC context chooses native fallback before collection and preserves zero', { timeout: 20000 }, async () => {
  const h = await fixture(() => { throw new Error('RPIV must not open in RPC'); }, 'Accept', 'rpc');
  try {
    assert.deepEqual((await h.run(args({ count: { type: 'integer' } }))).structuredContent, { action: 'accept', content: { count: 0 } });
    assert.deepEqual(h.stats(), { nested: 0, prompts: 0, dialogs: 2 });
  } finally { await h.close(); }
});
