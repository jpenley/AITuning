// Template only: prepare-native-test.mjs materializes this inside the Pi source suite.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { LATEST_PROTOCOL_VERSION } from '@earendil-works/pi-mcp';
import { createInMemoryTransportPair } from '@earendil-works/pi-mcp/testing';
import { expect, it, vi } from 'vitest';
import { createHarness, createTestUiContext } from '__HARNESS__';
import { createMcpExtension } from '__NATIVE__';
import { DefaultResourceLoader } from '__LOADER__';
import { SettingsManager } from '__SETTINGS__';

const RPIV_ROOT = '__RPIV_ROOT__';
const COMPANION_ROOT = '__COMPANION_ROOT__';
const booleanForm = { message: 'Choose a flag', requestedSchema: {
  type: 'object', properties: { flag: { type: 'boolean' } }, required: ['flag'],
} };
const integerForm = { message: 'Choose a count', requestedSchema: {
  type: 'object', properties: { count: { type: 'integer' } }, required: ['count'],
} };

// Only the provider, UI responses and remote server are fakes. Package discovery,
// provenance, tool permissions, nested execution and result processing remain real.
async function setup({ form = booleanForm, final = 'Accept', block = false } = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'aituning-native-elicitation-'));
  const agentDir = join(temp, 'agent');
  const cwd = join(temp, 'project');
  await mkdir(agentDir);
  await mkdir(cwd);
  const envNames = ['PI_CODING_AGENT_DIR', 'XDG_CONFIG_HOME', 'PI_MCP_ELICITATION_PROVIDER'];
  const oldEnv = new Map(envNames.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.XDG_CONFIG_HOME = temp;
  process.env.PI_MCP_ELICITATION_PROVIDER = 'auto';
  globalThis.fetch = () => { throw new Error('Network forbidden in native elicitation qualification'); };
  const pair = createInMemoryTransportPair();
  let harness, api, wire, capabilities, callId;
  const requests = [], calls = [], results = [], prompts = [], selects = [], inputs = [], errors = [];
  const unsubscribers = [];
  const serverWork = [];
  const send = message => {
    const work = pair.server.send(message);
    serverWork.push(work);
    return work;
  };
  pair.server.onMessage(message => {
    if (!('id' in message)) return;
    if (!('method' in message)) {
      // Capture the actual JSON-RPC answer, echo it through the server tool's
      // result, and only then complete tools/call (keeping the parent live).
      wire = message;
      if (callId === undefined) throw new Error('Elicitation reply without tools/call');
      void send({ jsonrpc: '2.0', id: callId, result: {
        content: [{ type: 'text', text: JSON.stringify(message) }],
      } });
      return;
    }
    requests.push(message);
    if (message.method === 'initialize') {
      capabilities = message.params?.capabilities;
      void send({ jsonrpc: '2.0', id: message.id, result: {
        protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: { tools: {} },
        serverInfo: { name: 'forms', version: '1' },
      } });
    } else if (message.method === 'tools/list') {
      void send({ jsonrpc: '2.0', id: message.id, result: { tools: [
        { name: 'ask', description: 'Ask an offline form', inputSchema: { type: 'object', properties: {} } },
      ] } });
    } else if (message.method === 'tools/call') {
      callId = message.id;
      void send({ jsonrpc: '2.0', id: 'wire-form', method: 'elicitation/create', params: form });
    } else {
      void send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported test server method' } });
    }
  });
  async function close() {
    try {
      if (harness) {
        await harness.session.abort();
        await harness.session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
      }
    } finally {
      try {
        for (const off of unsubscribers) off();
        harness?.cleanup();
        await pair.server.close();
        await Promise.all(serverWork);
      } finally {
        globalThis.fetch = oldFetch;
        for (const [key, value] of oldEnv) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        await rm(temp, { recursive: true, force: true });
      }
    }
  }
  try {
    await pair.server.start();
    const settings = { packages: [RPIV_ROOT, COMPANION_ROOT], enableAnalytics: false,
      compaction: { enabled: false }, retry: { enabled: false } };
    const loader = new DefaultResourceLoader({ cwd, agentDir,
      settingsManager: SettingsManager.inMemory(settings),
      noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [pi => {
        api = pi;
        unsubscribers.push(pi.events.on('rpiv:ask-user:prompt', prompt => {
          prompts.push(prompt);
          pi.events.emit('rpiv:ask-user:answer', { toolCallId: prompt.toolCallId,
            answers: prompt.questions.map((_question, questionIndex) => ({ questionIndex, optionIndexes: [1] })),
          });
        }));
        pi.on('tool_call', event => {
          calls.push(event);
          if (block && event.toolName === 'ask_user_question') return { block: true, reason: 'Offline permission denial' };
          return undefined;
        });
        pi.on('tool_result', event => { results.push(event); });
      }, createMcpExtension({
        loadConfig: () => ({ servers: [{ name: 'forms', config: { command: 'unused', exposure: 'direct' }, source: 'test' }], errors: [] }),
        createTransport: () => pair.client,
      })],
    });
    await loader.reload();
    expect(loader.getExtensions().errors).toEqual([]);
    expect(loader.getAgentsFiles().agentsFiles).toEqual([]);
    harness = await createHarness({ resourceLoader: loader, settings, initialActiveToolNames: [] });
    await harness.session.bindExtensions({ mode: 'tui', onError: error => errors.push(error),
      uiContext: createTestUiContext({
        select: async (title, options) => {
          selects.push({ title, options });
          if (!options.includes('Accept')) throw new Error('Unexpected native field fallback');
          return final;
        },
        input: async title => { inputs.push(title); return '0'; },
        custom: async () => { throw new Error('RPIV public answer must preempt rendering'); },
      }),
    });
    await vi.waitFor(() => expect(harness.session.getAllTools().some(t => t.name === 'mcp__forms__ask')).toBe(true));
    expect(capabilities).toMatchObject({ elicitation: { form: {} } });
    const rpiv = api.getAllTools().find(t => t.name === 'ask_user_question');
    expect(rpiv?.sourceInfo).toMatchObject({ origin: 'package', source: RPIV_ROOT });
    expect(api.getAllTools().some(t => t.name === 'mcp_elicitation_v1')).toBe(true);
    return { harness, calls, results, prompts, selects, inputs, requests, errors, close,
      get wire() { return wire; },
      async run() {
        harness.setResponses([
          fauxAssistantMessage([fauxToolCall('mcp__forms__ask', {})], { stopReason: 'toolUse' }),
          fauxAssistantMessage('done'),
        ]);
        await harness.session.prompt('Call the offline form tool');
        await vi.waitFor(() => expect(wire).toBeDefined());
        await Promise.all(serverWork);
        expect(errors).toEqual([]);
        expect(requests.filter(r => r.method === 'tools/call')).toHaveLength(1);
        const transcript = harness.session.messages.findLast(m => m.role === 'toolResult' && m.toolName === 'mcp__forms__ask');
        expect(transcript?.content).toContainEqual({ type: 'text', text: JSON.stringify(wire) });
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function assertChain(h) {
  const outer = h.calls.find(e => e.toolName === 'mcp__forms__ask');
  const companion = h.calls.find(e => e.toolName === 'mcp_elicitation_v1');
  const rpiv = h.calls.find(e => e.toolName === 'ask_user_question');
  expect(outer).toBeDefined();
  expect(companion).toBeDefined();
  expect(rpiv).toBeDefined();
  expect(companion.parentToolCallId).toBe(outer.toolCallId);
  expect(rpiv.parentToolCallId).toBe(companion.toolCallId);
  expect(companion.toolCallId).toBe(`${outer.toolCallId}/1`);
  expect(rpiv.toolCallId).toBe(`${companion.toolCallId}/1`);
  for (const call of [companion, rpiv]) {
    expect(h.results.find(e => e.toolCallId === call.toolCallId)).toMatchObject({
      toolName: call.toolName, parentToolCallId: call.parentToolCallId,
    });
  }
}

// Break caught: local RPIV provenance rejected, false coerced, or a nested layer bypassed.
it('preserves false through real RPIV, final consent and the server wire with two nested parents', async () => {
  const h = await setup();
  try {
    await h.run();
    expect(h.wire).toEqual({ jsonrpc: '2.0', id: 'wire-form', result: { action: 'accept', content: { flag: false } } });
    expect(h.prompts).toHaveLength(1);
    expect(h.selects).toHaveLength(1);
    expect(h.selects[0].title).toContain('final consent');
    expect(h.inputs).toHaveLength(0);
    assertChain(h);
    expect(h.results.find(e => e.toolName === 'ask_user_question')).toMatchObject({ isError: false });
  } finally { await h.close(); }
}, 20000);

// Break caught: permission denial is swallowed or causes native fallback/approval.
it('returns a technical wire error when the real RPIV tool_call gate blocks, without fallback', async () => {
  const h = await setup({ block: true });
  try {
    await h.run();
    expect(h.wire).toMatchObject({ error: { code: -32603 } });
    expect(h.wire).not.toHaveProperty('result');
    expect(h.calls.filter(e => e.toolName === 'ask_user_question')).toHaveLength(1);
    expect(h.prompts).toHaveLength(0);
    expect(h.selects).toHaveLength(0);
    expect(h.inputs).toHaveLength(0);
    expect(h.results.find(e => e.toolName === 'mcp_elicitation_v1')).toMatchObject({ isError: true });
  } finally { await h.close(); }
}, 20000);

// Break caught: an RPIV answer is treated as consent before the user's final review.
it('sends decline without values when final consent declines the real RPIV answer', async () => {
  const h = await setup({ final: 'Decline' });
  try {
    await h.run();
    expect(h.wire).toEqual({ jsonrpc: '2.0', id: 'wire-form', result: { action: 'decline' } });
    expect(h.prompts).toHaveLength(1);
    expect(h.selects).toHaveLength(1);
    expect(h.inputs).toHaveLength(0);
    assertChain(h);
  } finally { await h.close(); }
}, 20000);

// Break caught: unsupported integer collection opens RPIV first, or drops falsy zero.
it('selects native integer fallback before opening RPIV and sends zero after consent', async () => {
  const h = await setup({ form: integerForm });
  try {
    await h.run();
    expect(h.wire).toEqual({ jsonrpc: '2.0', id: 'wire-form', result: { action: 'accept', content: { count: 0 } } });
    expect(h.prompts).toHaveLength(0);
    expect(h.calls.filter(e => e.toolName === 'ask_user_question')).toHaveLength(0);
    expect(h.inputs).toHaveLength(1);
    expect(h.selects).toHaveLength(1);
    expect(h.selects[0].title).toContain('final consent');
  } finally { await h.close(); }
}, 20000);
