// Only the remote MCP peer, provider responses and UI responses are fakes.
// Host loading/provenance, dispatch, Codemode, hooks and nested contexts stay real.
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mirrorEntry = resolve(here, '../index.ts');
const collectorEntry = resolve(here, '../../pi-mcp-elicitation/index.ts');
const prerequisites = Object.fromEntries(['SDK_ROOT', 'RPIV_ROOT'].map(key => {
  assert.ok(process.env[key] && isAbsolute(process.env[key]), `${key} must be an explicit absolute package root`);
  return [key, resolve(process.env[key])];
}));
export const control = process.env.MIRROR_CONTROL ?? 'mirror';
assert.ok(['mirror', 'native'].includes(control), 'MIRROR_CONTROL must be mirror or native');

export const booleanForm = { message: 'Choose a flag', requestedSchema: {
  type: 'object', properties: { flag: { type: 'boolean' } }, required: ['flag'],
} };
export const integerForm = { message: 'Choose a count', requestedSchema: {
  type: 'object', properties: { count: { type: 'integer' } }, required: ['count'],
} };
export const largeText = 'start:' + 'x'.repeat(26000) + ':complete-tail';
export const ordinaryTools = [
  { name: 'echo', description: 'Echo complete data', inputSchema: { type: 'object', properties: { value: { type: 'integer' } }, required: ['value'] },
    outputSchema: { type: 'object', properties: { flag: { type: 'boolean' }, count: { type: 'integer' } }, required: ['flag', 'count'] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'failed', description: 'Structured failure data', inputSchema: { type: 'object', properties: {} } },
  { name: 'read.item', description: 'First colliding spelling', inputSchema: { type: 'object', properties: {} } },
  { name: 'read-item', description: 'Second colliding spelling', inputSchema: { type: 'object', properties: {} } },
  { name: 'discover', description: 'Offline discovery needle', inputSchema: { type: 'object', properties: {} } },
  { name: 'secret', description: 'Must remain hidden', inputSchema: { type: 'object', properties: {} } },
];

export async function until(predicate, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`Timed out waiting for ${label}`);
}
export async function bounded(work, label, timeout = 10000) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

// Resolve only public export-map entries from the explicitly selected installation.
// require.resolve cannot resolve these packages' import-only export conditions.
async function installedPublic(specifier) {
  const segments = specifier.split('/');
  const packageName = segments.slice(0, 2).join('/');
  const subpath = segments.length === 2 ? '.' : './' + segments.slice(2).join('/');
  let directory = prerequisites.SDK_ROOT;
  while (true) {
    const root = join(directory, 'node_modules', packageName);
    let manifest;
    try { manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (manifest) {
      const entry = manifest.exports?.[subpath];
      const target = typeof entry === 'string' ? entry : entry?.import;
      assert.equal(typeof target, 'string', `Missing public import export: ${specifier}`);
      return import(pathToFileURL(join(root, target)).href);
    }
    const parent = dirname(directory);
    assert.notEqual(parent, directory, `Missing installed dependency ${specifier} under SDK_ROOT`);
    directory = parent;
  }
}

export async function setup({ factory = control, collector = true, form, final = 'Accept',
  deny, cancelRpiv = false, holdConsent = false, slow = false, registeredOnly = false, httpAuth = false, storedAuth, mockFetch, resourceSpoof = false, interactive = true, mode = 'tui' } = {}) {
  // Isolation precedes importing SDK modules (some capture config paths at evaluation).
  const savedEnv = { ...process.env };
  const savedCwd = process.cwd();
  const oldFetch = globalThis.fetch;
  const temp = await mkdtemp(join(tmpdir(), 'pi-mcp-mirror-stock-'));
  const cwd = join(temp, 'project'), agentDir = join(temp, 'agent');
  await Promise.all([mkdir(cwd), mkdir(agentDir), mkdir(join(temp, 'home')), mkdir(join(temp, 'tmp'))]);
  for (const key of Object.keys(process.env)) {
    if (!/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(key)) delete process.env[key];
  }
  Object.assign(process.env, { HOME: join(temp, 'home'), USERPROFILE: join(temp, 'home'),
    APPDATA: join(temp, 'home'), LOCALAPPDATA: join(temp, 'home'), XDG_CONFIG_HOME: join(temp, 'home'),
    XDG_CACHE_HOME: join(temp, 'home'), TEMP: join(temp, 'tmp'), TMP: join(temp, 'tmp'), TMPDIR: join(temp, 'tmp'),
    PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1',
    PI_MCP_ELICITATION_PROVIDER: 'auto' });
  process.chdir(cwd);
  let networkAttempts = 0;
  globalThis.fetch = mockFetch ?? (async () => { networkAttempts++; throw new Error('Network forbidden in stock mirror qualification'); });
  if (storedAuth) await writeFile(join(agentDir, 'mcp-auth.json'), JSON.stringify(storedAuth), 'utf8');
  let session, pair, api, transportAuth;
  const transportState = { closed: false, created: 0 };
  let transportError;
  const completedTurns = { count: 0 };
  let closed = false, wire, capabilities, pendingCall, releaseConsent;
  let tools = form ? [{ name: 'ask', description: 'Ask an offline form', inputSchema: { type: 'object', properties: {} } }] : structuredClone(ordinaryTools);
  const requests = [], replies = [], calls = [], results = [], prompts = [], selects = [], inputs = [], errors = [], notifications = [], lifecycle = [];
  const peerErrors = [], serverWork = [], off = [], uiUpdates = [];
  let listRequest, releaseList;
  const listSeen = new Promise(resolve => { releaseList = resolve; });
  const send = message => {
    const work = pair.server.send(message).catch(error => { peerErrors.push(error); });
    serverWork.push(work);
    return work;
  };
  const respondList = () => {
    assert.ok(listRequest, 'tools/list must arrive before releasing the slow peer');
    void send({ jsonrpc: '2.0', id: listRequest.id, result: { tools } });
    listRequest = undefined;
  };
  async function close() {
    if (closed) return;
    closed = true;
    try {
      releaseConsent?.(undefined);
      if (session) {
        await bounded(session.abort(), 'session abort');
        await bounded(session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }), 'MCP shutdown');
        session.dispose();
      }
      for (const unsubscribe of off) unsubscribe();
      if (pair) await pair.server.close();
      await Promise.all(serverWork);
      assert.equal(networkAttempts, 0, 'qualification attempted network access');
      assert.deepEqual(peerErrors, [], 'fake peer send failures');
    } finally {
      delete globalThis[bridgeKey];
      globalThis.fetch = oldFetch;
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, savedEnv);
      process.chdir(savedCwd);
      await rm(temp, { recursive: true, force: true });
    }
  }
  const bridgeKey = `pi-mcp-mirror-qualification:${temp}`;
  try {
    await access(join(prerequisites.SDK_ROOT, 'dist/index.js'));
    const sdkManifest = JSON.parse(await readFile(join(prerequisites.SDK_ROOT, 'package.json'), 'utf8'));
    assert.equal(sdkManifest.version, '1.3.0', 'qualify the pinned installed stock SDK');
    const rpivManifest = JSON.parse(await readFile(join(prerequisites.RPIV_ROOT, 'package.json'), 'utf8'));
    assert.equal(rpivManifest.name, '@juicesharp/rpiv-ask-user-question');
    assert.equal(rpivManifest.version, '2.13.9');
    const sdk = await import(pathToFileURL(join(prerequisites.SDK_ROOT, 'dist/index.js')).href);
    const ai = await installedPublic('@earendil-works/pi-ai');
    const mcp = await installedPublic('@earendil-works/pi-mcp');
    const testing = await installedPublic('@earendil-works/pi-mcp/testing');
    pair = testing.createInMemoryTransportPair();
    const closeTransport = pair.client.close.bind(pair.client);
    pair.client.close = async () => { await closeTransport(); transportState.closed = true; };
    pair.server.onMessage(message => {
      if (!('method' in message)) {
        replies.push(message);
        if (message.id === 'wire-form') {
          wire = message;
          assert.notEqual(pendingCall, undefined, 'form reply must belong to a live tools/call');
          void send({ jsonrpc: '2.0', id: pendingCall, result: { content: [{ type: 'text', text: JSON.stringify(message) }] } });
          pendingCall = undefined;
        }
        return;
      }
      requests.push(message);
      if (!('id' in message)) return;
      const reply = result => void send({ jsonrpc: '2.0', id: message.id, result });
      switch (message.method) {
        case 'initialize':
          capabilities = message.params?.capabilities;
          reply({ protocolVersion: mcp.LATEST_PROTOCOL_VERSION, capabilities: { tools: { listChanged: true }, resources: {} },
            serverInfo: { name: 'offline-fixture', version: '1' }, instructions: 'Offline laboratory.\nKeep complete structured results.' });
          break;
        case 'tools/list':
          if (slow && !listRequest) { listRequest = message; releaseList(); }
          else reply({ tools });
          break;
        case 'tools/call':
          if (form) {
            pendingCall = message.id;
            void send({ jsonrpc: '2.0', id: 'wire-form', method: 'elicitation/create', params: form });
          } else if (message.params.name === 'echo') {
            const token = message.params?._meta?.progressToken;
            if (token !== undefined) void send({ jsonrpc: '2.0', method: 'notifications/progress', params: {
              progressToken: token, progress: 1, total: 1, message: 'Offline tool progress',
            } });
            reply({ content: [{ type: 'text', text: largeText }], structuredContent: { flag: false, count: message.params.arguments.value }, isError: false,
              _meta: { privateFixtureMetadata: 'must not reach scripts' } });
          } else if (message.params.name === 'failed') {
            reply({ content: [{ type: 'text', text: 'remote failure with data' }], structuredContent: { flag: false, count: 0 }, isError: true });
          } else reply({ content: [{ type: 'text', text: message.params.name }] });
          break;
        case 'resources/list': reply({ resources: [{ uri: 'memory://note', name: 'note', mimeType: 'text/plain', ...(resourceSpoof ? { server: 'forged-other-server' } : {}) }] }); break;
        case 'resources/templates/list': reply({ resourceTemplates: resourceSpoof ? [{ uriTemplate: 'memory://{name}', name: 'template', server: 'forged-other-server' }] : [] }); break;
        case 'resources/read': reply({ contents: [{ uri: 'memory://note', mimeType: 'text/plain', text: 'offline resource value' }] }); break;
        case 'ping': reply({}); break;
        default: void send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported offline method' } });
      }
    });
    await pair.server.start();
    const config = { ...(httpAuth ? { url: 'https://mcp.example.invalid/mcp' } : { command: 'NEVER-SPAWN-THIS' }), exposure: 'codemode',
      toolExposure: { discover: 'deferred', secret: 'hidden' } };
    const options = { loadConfig: () => ({ servers: registeredOnly ? [] : [{ name: 'lab-docs', config, source: join(temp, 'mcp.json') }], errors: [] }),
      createTransport: (_config, _cwd, authProvider) => {
        transportState.created++;
        transportAuth = authProvider;
        if (transportError) throw transportError;
        return pair.client;
      }, logPath: join(temp, 'mcp.log'),
      openUrl: () => assert.fail('OAuth/browser access forbidden'),
      updateConfig: () => assert.fail('qualification must not persist permissions or config') };
    const observer = pi => {
      api = pi;
      off.push(pi.events.on('rpiv:ask-user:prompt', prompt => {
        prompts.push(prompt);
        pi.events.emit('rpiv:ask-user:answer', cancelRpiv ? { toolCallId: prompt.toolCallId, cancel: true } : {
          toolCallId: prompt.toolCallId, answers: prompt.questions.map((_q, questionIndex) => ({ questionIndex, optionIndexes: [1] })),
        });
      }));
      pi.on('tool_call', event => {
        calls.push(event);
        if (event.toolName === deny) return { block: true, reason: 'Offline permission denial' };
      });
      pi.on('tool_result', event => { results.push(event); });
    };
    // The SDK's own loader runs this TypeScript wrapper with its jiti aliases.
    // The bridge carries injected transport/config seams only, never a fake host API.
    globalThis[bridgeKey] = { options, observe: observer,
      afterObserve: pi => pi.on('turn_start', () => { completedTurns.count++; }) };
    const wrapper = join(temp, 'qualification.ts');
    const imports = factory === 'native'
      ? `import { createMcpExtension as factory } from '@earendil-works/pi-coding-agent';\n${collector ? `import collector from ${JSON.stringify(collectorEntry.replaceAll('\\', '/'))};` : ''}`
      : `import { createMcpMirrorExtension as factory } from ${JSON.stringify(mirrorEntry.replaceAll('\\', '/'))};`;
    await writeFile(wrapper, `${imports}\nexport default async function(pi) {\nconst bridge = globalThis[${JSON.stringify(bridgeKey)}];\nbridge.observe(pi);\n${factory === 'native' && collector ? 'await collector(pi);' : ''}\nawait factory(bridge.options)(pi);\nbridge.afterObserve(pi);\n}\n`, 'utf8');
    const settings = sdk.SettingsManager.inMemory({ packages: [prerequisites.RPIV_ROOT], enableAnalytics: false,
      compaction: { enabled: false }, retry: { enabled: false }, ...(slow ? { defaultTools: ['+codemode'] } : {}) });
    const loader = new sdk.DefaultResourceLoader({ cwd, agentDir, settingsManager: settings,
      additionalExtensionPaths: [wrapper], noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [
        { name: 'codemode', builtin: true, factory: sdk.createCodemodeExtension({ mode: 'on', models: false }) },
        { name: 'tool-search', builtin: true, factory: sdk.createToolSearchExtension() },
        { name: 'mcp', builtin: true, replaceable: true, factory: sdk.createMcpExtension(options) }] });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, [], 'public SDK loader must load real packages and public factory');
    assert.deepEqual(loader.getAgentsFiles().agentsFiles, []);
    const credentials = { read: async () => undefined, list: async () => [],
      modify: async () => assert.fail('credential writes forbidden'), delete: async () => assert.fail('credential deletion forbidden') };
    const runtime = await sdk.ModelRuntime.create({ credentials, modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
    const faux = ai.fauxProvider({ provider: 'offline-mirror-qualification' });
    runtime.registerNativeProvider(faux.provider);
    ({ session } = await sdk.createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: faux.getModel(),
      thinkingLevel: 'off', noTools: 'builtin', ...(slow ? { tools: ['+codemode'] } : {}), resourceLoader: loader, settingsManager: settings,
      sessionManager: sdk.SessionManager.inMemory(cwd) }));
    assert.ok(session instanceof sdk.AgentSession, 'must use actual installed AgentSession');
    session.subscribe(event => { lifecycle.push(event); });
    const uiContext = {
      select: async (title, choices, opts) => {
        selects.push({ title, choices });
        assert.deepEqual(choices, ['Accept', 'Decline', 'Cancel'], 'native field fallback must never follow an RPIV attempt');
        if (holdConsent) return new Promise(resolve => {
          const finish = value => { opts?.signal?.removeEventListener('abort', abort); resolve(value); };
          const abort = () => finish(undefined);
          releaseConsent = finish;
          opts?.signal?.addEventListener('abort', abort, { once: true });
          if (opts?.signal?.aborted) abort();
        });
        return final;
      },
      input: async title => { inputs.push(title); return '0'; },
      confirm: async () => assert.fail('unexpected permission/UI confirmation'),
      custom: async () => assert.fail('RPIV external answer must preempt custom rendering'),
      notify: (message, type) => notifications.push({ message, type }),
      setStatus: (...args) => { uiUpdates.push({ method: 'setStatus', args }); },
      setWidget: (...args) => { uiUpdates.push({ method: 'setWidget', args }); },
      setTitle: (...args) => { uiUpdates.push({ method: 'setTitle', args }); },
      setWorkingMessage: (...args) => { uiUpdates.push({ method: 'setWorkingMessage', args }); },
    };
    await session.bindExtensions({ mode: interactive ? mode : 'print', onError: error => errors.push(error),
      ...(interactive ? { uiContext } : {}) });
    const h = { session, sdk, api, loader, temp, agentDir, transportState, completedTurns, get authProvider() { return transportAuth; }, calls, results, prompts, selects, inputs, errors, requests, replies, lifecycle, notifications,
      listSeen, respondList, close, failTransportWith: error => { transportError = error; }, get capabilities() { return capabilities; }, get wire() { return wire; },
      releaseConsent: value => { assert.ok(releaseConsent, 'consent is not open'); releaseConsent(value); },
      register: () => api.registerMcpServer('lab-docs', config),
      withdraw: () => api.unregisterMcpServer('lab-docs'),
      async changeTools(nextTools) {
        tools = structuredClone(nextTools);
        await send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
      },
      beginTool(name, args) {
        faux.setResponses([ai.fauxAssistantMessage([ai.fauxToolCall(name, args, { id: `outer-${calls.length}` })], { stopReason: 'toolUse' }), ai.fauxAssistantMessage('done')]);
        return bounded(session.prompt('Perform the offline qualification operation'), `${name} prompt`);
      },
      async runTool(name, args) {
        await h.beginTool(name, args);
        assert.deepEqual(errors, [], 'extension runtime errors');
        const result = session.messages.findLast(m => m.role === 'toolResult' && m.toolName === name);
        assert.ok(result, `${name} must produce a public transcript result`);
        return result;
      },
      async script(code) {
        const result = await h.runTool('codemode', { code: `// @options: {"timeout_ms": 5000}\n${code}` });
        assert.equal(result.isError, false, JSON.stringify(result.content));
        const output = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        const payload = /QUAL:([^\r\n]*)/.exec(output);
        assert.ok(payload, `missing script payload: ${output}`);
        return JSON.parse(payload[1]);
      },
      async ready() {
        await until(() => {
          const failure = notifications.find(n => n.type === 'error');
          assert.ok(!failure, JSON.stringify({ failure, errors }));
          return session.getAllTools().some(t => t.name === `mcp__lab_docs__${form ? 'ask' : 'echo'}`);
        }, 'MCP registration');
      },
    };
    return h;
  } catch (error) {
    await close();
    throw error;
  }
}

export function assertChain(h, names) {
  let parent;
  for (const name of names) {
    const matches = h.calls.filter(call => call.toolName === name);
    assert.equal(matches.length, 1, `${name} must go through exactly one real permission hook`);
    const call = matches[0];
    assert.equal(call.parentToolCallId, parent?.toolCallId, `${name} parent chain`);
    if (parent) assert.equal(call.toolCallId, `${parent.toolCallId}/1`);
    const result = h.results.find(result => result.toolCallId === call.toolCallId);
    assert.ok(result, `${name} must pass through real result hooks`);
    assert.equal(result.parentToolCallId, call.parentToolCallId);
    parent = call;
  }
}
