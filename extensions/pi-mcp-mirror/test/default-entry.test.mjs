// Break caught: default package entry omits its collector, loses package provenance,
// fails to replace native /mcp, bypasses consent/host dispatch on the stdio path,
// ignores --no-mcp, or mistakes a prompt/option value for the disable flag.
// Run separately: isolation must precede the FIRST SDK/model import in this process.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mirrorRoot = resolve(here, '..');
const peer = join(here, 'stdio.fixture.mjs');

async function until(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`Timed out waiting for ${label}`);
}
async function bounded(work, label) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 15000);
    })]);
  } finally { clearTimeout(timer); }
}
// Resolve public import-only exports in the explicitly selected SDK installation.
async function publicDependency(sdkRoot, name) {
  let directory = sdkRoot;
  for (;;) {
    const root = join(directory, 'node_modules', name);
    let manifest;
    try { manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (manifest) {
      const entry = manifest.exports?.['.'];
      const target = typeof entry === 'string' ? entry : entry?.import;
      assert.equal(typeof target, 'string', `Missing public import export for ${name}`);
      return import(pathToFileURL(join(root, target)).href);
    }
    const parent = dirname(directory);
    assert.notEqual(parent, directory, `Missing ${name} under SDK_ROOT`);
    directory = parent;
  }
}

// Only external UI/provider/remote peer are doubles. No wrappers, injected MCP
// options, replacement dispatch, fabricated sourceInfo, or supplied ctx.tools.
for (const scenario of [
  { name: 'enabled', args: [], disabled: false },
  { name: '--no-mcp disables the mirror', args: ['--no-mcp'], disabled: true },
  { name: '--no-mcp after -- is a prompt', args: ['--', '--no-mcp'], disabled: false },
  { name: '--no-mcp as an option value is not a switch', args: ['--append-system-prompt', '--no-mcp'], disabled: false },
]) test(`production default package: ${scenario.name}`,
  { concurrency: false, timeout: 60000 }, async () => {
    assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Native Node >=24 required');
    assert.ok(process.env.SDK_ROOT && isAbsolute(process.env.SDK_ROOT), 'SDK_ROOT must be an explicit absolute Pi 1.3.0 package root');
    const sdkRoot = resolve(process.env.SDK_ROOT);
    const savedEnv = { ...process.env }, savedCwd = process.cwd(), oldFetch = globalThis.fetch;
    const savedArgv = process.argv;
    const temp = await mkdtemp(join(tmpdir(), 'pi-mcp-default-entry-'));
    const cwd = join(temp, 'project'), agentDir = join(temp, 'agent');
    const home = join(temp, 'home'), scratch = join(temp, 'tmp'), auditPath = join(temp, 'peer.jsonl');
    let session, work, releaseConsent, childPid, networkAttempts = 0;
    const calls = [], results = [], errors = [], selects = [], inputs = [], notifications = [], uiUpdates = [];
    let observedApi;
    const audit = async () => {
      try { return (await readFile(auditPath, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    };
    const probeExited = pid => {
      // Read-only existence probe for the pid supplied by OUR local fixture. Never kill.
      try { process.kill(pid, 0); return false; }
      catch (error) { if (error.code === 'ESRCH') return true; throw error; }
    };
    try {
      // Simulate CLI argv at the public factory boundary, not Node test flags.
      process.argv = [process.execPath, join(sdkRoot, 'dist/cli.js'), ...scenario.args];
      await Promise.all([cwd, agentDir, home, scratch].map(path => mkdir(path)));
      // Retain only OS execution essentials, not provider keys, profile selectors,
      // NODE_OPTIONS, proxy settings, or inherited Pi configuration.
      for (const key of Object.keys(process.env)) {
        if (!/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(key)) delete process.env[key];
      }
      Object.assign(process.env, { HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
        XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, XDG_DATA_HOME: home,
        TEMP: scratch, TMP: scratch, TMPDIR: scratch, PI_CODING_AGENT_DIR: agentDir,
        PI_OFFLINE: '1', PI_MCP_ELICITATION_PROVIDER: 'auto' });
      process.chdir(cwd);
      globalThis.fetch = async () => { networkAttempts++; throw new Error('Network forbidden in default-entry regression'); };
      // Missing prerequisites fail rather than skip or install anything.
      await Promise.all([access(join(sdkRoot, 'dist/index.js')), access(join(mirrorRoot, 'index.ts')), access(peer)]);
      assert.equal(JSON.parse(await readFile(join(sdkRoot, 'package.json'), 'utf8')).version, '1.3.0');
      assert.equal(JSON.parse(await readFile(join(mirrorRoot, 'package.json'), 'utf8')).name, 'pi-mcp-mirror');
      const config = JSON.stringify({ mcpServers: { 'entry-lab': {
        command: process.execPath, args: [peer, auditPath], cwd, exposure: 'codemode',
        toolExposure: { discover: 'deferred' }, timeout: 10,
      } } });
      await writeFile(join(agentDir, 'mcp.json'), config, 'utf8');

      // Nothing from the SDK or model registry is imported until after isolation.
      const sdk = await import(pathToFileURL(join(sdkRoot, 'dist/index.js')).href);
      const ai = await publicDependency(sdkRoot, '@earendil-works/pi-ai');
      assert.equal(sdk.getAgentDir(), agentDir);
      const settings = sdk.SettingsManager.inMemory({ packages: [mirrorRoot], enableAnalytics: false,
        compaction: { enabled: false }, retry: { enabled: false }, defaultTools: ['+tool_search'] });
      const observer = pi => {
        observedApi = pi;
        pi.on('tool_call', event => { calls.push(event); });
        pi.on('tool_result', event => { results.push(event); });
      };
      const parsed = sdk.parseArgs(scenario.args);
      assert.equal(parsed.noMcp === true, scenario.disabled, 'scenario agrees with the pinned public CLI parser');
      const loader = new sdk.DefaultResourceLoader({ cwd, agentDir, settingsManager: settings,
        disabledBuiltinExtensions: parsed.noMcp ? ['mcp'] : undefined,
        noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
        extensionFactories: [
          { name: 'codemode', builtin: true, factory: sdk.createCodemodeExtension({ mode: 'on', models: false }) },
          { name: 'tool-search', builtin: true, factory: sdk.createToolSearchExtension() }, observer,
          { name: 'mcp', builtin: true, replaceable: true, factory: sdk.createMcpExtension() }] });
      await loader.reload();
      const loaded = loader.getExtensions();
      assert.deepEqual(loaded.errors, [], 'real default package must load without a wrapper');
      assert.deepEqual(loader.getAgentsFiles().agentsFiles, [], 'no user/project context profile is loaded');
      const packageExtension = loaded.extensions.find(extension => extension.sourceInfo.origin === 'package');
      assert.ok(packageExtension, 'package default export must actually be loaded');
      assert.equal(await realpath(packageExtension.resolvedPath), await realpath(join(mirrorRoot, 'index.ts')));
      assert.equal(await realpath(packageExtension.sourceInfo.source), await realpath(mirrorRoot));
      const owners = loaded.extensions.filter(extension => extension.commands.has('mcp'));
      if (scenario.disabled) {
        assert.equal(owners.length, 0, '--no-mcp must register no /mcp command');
        assert.equal(packageExtension.tools.size, 0, 'disabled mirror must not register its collector or resource tools');
        assert.equal(packageExtension.handlers.size, 0, 'disabled mirror must not leave startup/reload/registration hooks');
        await loader.reload();
        const reloaded = loader.getExtensions();
        assert.deepEqual(reloaded.errors, []);
        assert.ok(!reloaded.extensions.some(extension => extension.path === 'builtin:mcp'),
          'reload must not restore the disabled native connector');
        const mirror = reloaded.extensions.find(extension => extension.sourceInfo.origin === 'package');
        assert.ok(mirror, 'reload must exercise the same package default factory');
        assert.equal(mirror.commands.size, 0);
        assert.equal(mirror.tools.size, 0);
        assert.equal(mirror.handlers.size, 0);
      } else {
        assert.equal(owners.length, 1, '/mcp must suppress the replaceable stock connector');
        assert.equal(owners[0], packageExtension);
      }
      assert.ok(!loaded.extensions.some(extension => extension.path === 'builtin:mcp'), 'native connector must be replaced, not merely idle');

      const credentials = { read: async () => undefined, list: async () => [],
        modify: async () => assert.fail('credential writes forbidden'), delete: async () => assert.fail('credential deletion forbidden') };
      const runtime = await sdk.ModelRuntime.create({ credentials, modelsPath: null,
        allowModelNetwork: false, refreshOnCreate: false });
      const faux = ai.fauxProvider({ provider: 'offline-default-entry' });
      runtime.registerNativeProvider(faux.provider);
      ({ session } = await sdk.createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: faux.getModel(),
        thinkingLevel: 'off', noTools: 'builtin', resourceLoader: loader, settingsManager: settings,
        sessionManager: sdk.SessionManager.inMemory(cwd) }));
      assert.ok(session instanceof sdk.AgentSession);
      await session.bindExtensions({ mode: 'tui', onError: error => errors.push(error), uiContext: {
        select: async (title, choices, opts) => {
          selects.push({ title, choices });
          if (selects.length === 1) {
            assert.match(title, /Field: flag/);
            assert.deepEqual(choices, ['C1: true', 'C2: false']);
            return 'C2: false';
          }
          assert.equal(selects.length, 2, 'only boolean field and final consent selectors expected');
          assert.match(title, /final consent/);
          assert.match(title, /flag = false/);
          assert.match(title, /count = 0/);
          assert.deepEqual(choices, ['Accept', 'Decline', 'Cancel']);
          return new Promise(resolve => {
            const finish = value => { opts.signal.removeEventListener('abort', abort); resolve(value); };
            const abort = () => finish(undefined);
            releaseConsent = finish;
            opts.signal.addEventListener('abort', abort, { once: true });
            if (opts.signal.aborted) abort();
          });
        },
        input: async (title, placeholder) => {
          inputs.push({ title, placeholder });
          assert.match(title, /Field: count/);
          return '0';
        },
        confirm: async () => assert.fail('unexpected permission confirmation'),
        custom: async () => assert.fail('native fallback must not render RPIV/custom UI'),
        notify: (message, type) => notifications.push({ message, type }),
        setStatus: (...args) => { uiUpdates.push({ method: 'setStatus', args }); },
        setWidget: (...args) => { uiUpdates.push({ method: 'setWidget', args }); },
        setTitle: (...args) => { uiUpdates.push({ method: 'setTitle', args }); },
        setWorkingMessage: (...args) => { uiUpdates.push({ method: 'setWorkingMessage', args }); },
      } });
      if (scenario.disabled) {
        assert.deepEqual(session.getAllTools().filter(tool => /^(mcp_|list_mcp_|read_mcp_)/.test(tool.name)), [],
          'no collector, resources or remote MCP tools; ordinary host tools are unaffected');
        for (const name of ['codemode', 'tool_search']) {
          const tool = session.getAllTools().find(tool => tool.name === name);
          assert.equal(tool.sourceInfo.source, 'builtin');
        }
        assert.deepEqual(await audit(), [], 'the configured stdio peer must never start');
        assert.deepEqual(errors, []);
        assert.deepEqual(notifications, []);
        assert.deepEqual(uiUpdates, [], 'disabled connector must not update the UI');
        assert.equal(networkAttempts, 0);
        assert.equal(await readFile(join(agentDir, 'mcp.json'), 'utf8'), config);
        assert.deepEqual(await readdir(home), []);
        return;
      }
      await until(async () => {
        const start = (await audit()).find(event => event.event === 'started');
        if (start) childPid = start.pid;
        assert.deepEqual(errors, []);
        assert.ok(!notifications.some(n => n.type === 'error'), JSON.stringify(notifications));
        return session.getAllTools().some(tool => tool.name === 'mcp__entry_lab__ask');
      }, 'default connector stdio tools/list');
      assert.ok(Number.isInteger(childPid) && childPid > 0 && childPid !== process.pid);
      assert.equal(probeExited(childPid), false, 'fixture must still be running');
      assert.ok(session.getActiveToolNames().includes('codemode'), 'default config must activate real stock Codemode');
      assert.ok(session.getAllTools().some(tool => tool.name === 'tool_search'));
      for (const name of ['codemode', 'tool_search']) {
        const tool = session.getAllTools().find(tool => tool.name === name);
        assert.equal(tool.sourceInfo.source, 'builtin', `${name} keeps native builtin provenance`);
        assert.equal(tool.sourceInfo.path, `builtin:${name === 'tool_search' ? 'tool-search' : name}`);
      }
      assert.ok(!session.getAllTools().some(tool => tool.name === 'ask_user_question'), 'no RPIV package is loaded');
      for (const name of ['mcp_elicitation_v1', 'mcp__entry_lab__ask']) {
        const tool = session.getAllTools().find(tool => tool.name === name);
        assert.ok(tool, `${name} registered by actual default entry`);
        assert.deepEqual(tool.sourceInfo, packageExtension.sourceInfo, `${name} retains real package provenance`);
      }
      const commands = observedApi.getCommands().filter(command => command.name === 'mcp');
      assert.equal(commands.length, 1);
      assert.deepEqual(commands[0].sourceInfo, packageExtension.sourceInfo);
      faux.setResponses([ai.fauxAssistantMessage([ai.fauxToolCall('codemode', {
        code: '// @options: {"timeout_ms": 10000}\nconst r = await tools.mcp__entry_lab__ask({}); text("ENTRY:" + r.content[0].text);',
      }, { id: 'outer-default-entry' })], { stopReason: 'toolUse' }), ai.fauxAssistantMessage('done')]);
      work = bounded(session.prompt('Run the isolated default entry regression'), 'Codemode prompt');
      // Observe rejection immediately even while waiting for the held external UI.
      let settled = false;
      const outcome = work.then(() => { settled = true; }, error => { settled = true; throw error; });
      outcome.catch(error => { errors.push(error); });
      await until(() => { assert.deepEqual(errors, []); return releaseConsent !== undefined; }, 'explicit final Accept dialog');
      assert.equal(settled, false);
      const beforeAccept = await audit();
      assert.equal(beforeAccept.filter(event => event.event === 'started').length, 1);
      assert.equal(beforeAccept.filter(event => event.message?.method === 'initialize').length, 1);
      assert.equal(beforeAccept.filter(event => event.message?.method === 'tools/call').length, 1);
      assert.equal(beforeAccept.filter(event => event.message?.id === 'entry-form').length, 0, 'no elicitation response before explicit Accept');
      assert.ok(!results.some(event => event.toolName === 'mcp_elicitation_v1'), 'collector must wait for consent');
      releaseConsent('Accept');
      await outcome;
      const result = session.messages.findLast(message => message.role === 'toolResult' && message.toolName === 'codemode');
      assert.ok(result);
      assert.equal(result.isError, false, JSON.stringify(result.content));
      const payload = /ENTRY:([^\r\n]*)/.exec(result.content.filter(c => c.type === 'text').map(c => c.text).join('\n'));
      assert.ok(payload, 'real native Codemode must return the peer result');
      const wireResult = JSON.parse(payload[1]);
      assert.equal(wireResult.pid, childPid);
      assert.deepEqual(wireResult.isolation, { cwd, home, agentDir }, 'real stdio child inherits only the isolated profile');
      assert.deepEqual(wireResult.clientCapabilities.elicitation, { form: {} });
      assert.deepEqual(wireResult.wire, { jsonrpc: '2.0', id: 'entry-form',
        result: { action: 'accept', content: { flag: false, count: 0 } } });
      assert.equal(wireResult.initializeCount, 1);
      assert.equal(wireResult.listCount, 1);
      assert.equal(wireResult.callCount, 1, 'no duplicate connector or side-effect replay');
      assert.equal(inputs.length, 1);
      assert.equal(selects.length, 2);
      let parent;
      for (const name of ['codemode', 'mcp__entry_lab__ask', 'mcp_elicitation_v1']) {
        const matches = calls.filter(call => call.toolName === name);
        assert.equal(matches.length, 1, `${name} passes through real host permission hooks exactly once`);
        const call = matches[0];
        assert.equal(call.parentToolCallId, parent?.toolCallId);
        if (parent) assert.equal(call.toolCallId, `${parent.toolCallId}/1`);
        const matchesResult = results.filter(event => event.toolCallId === call.toolCallId);
        assert.equal(matchesResult.length, 1, `${name} passes through real result hooks`);
        assert.equal(matchesResult[0].parentToolCallId, call.parentToolCallId);
        assert.equal(matchesResult[0].isError, false);
        parent = call;
      }
      assert.equal(session.messages.filter(message => message.role === 'toolResult' && message.toolName !== 'codemode').length, 0);
      // Native discovery activates for the explicitly deferred tool, while ask
      // stays codemode-only. Do not make a codemode-only tool directly searchable.
      faux.setResponses([ai.fauxAssistantMessage([ai.fauxToolCall('tool_search', {
        query: 'regression needle', limit: 1,
      }, { id: 'search-default-entry' })], { stopReason: 'toolUse' }), ai.fauxAssistantMessage('done')]);
      await bounded(session.prompt('Discover the offline fixture tool'), 'stock tool_search');
      const searchResult = session.messages.findLast(message => message.role === 'toolResult' && message.toolName === 'tool_search');
      assert.ok(searchResult);
      assert.equal(searchResult.isError, false, JSON.stringify(searchResult.content));
      assert.ok(session.getActiveToolNames().includes('mcp__entry_lab__discover'), 'actual stock tool_search must activate its deferred match');
      const afterSearch = await audit();
      assert.equal(afterSearch.filter(event => event.message?.method === 'tools/call').length, 1, 'discovery must not replay the MCP operation');
      assert.deepEqual(errors, []);
      assert.equal(networkAttempts, 0);
      assert.equal(await readFile(join(agentDir, 'mcp.json'), 'utf8'), config, 'no persisted approval/config mutation');
      assert.deepEqual(await readdir(home), [], 'isolated replacement profile remains unused');
      assert.equal(process.env.PI_CODING_AGENT_DIR, agentDir);
      assert.equal(process.cwd(), cwd);
      assert.ok(!Object.keys(process.env).some(key => /API_KEY|TOKEN|SECRET|RPIV_ROOT/i.test(key)), 'no live credential/profile selectors survive isolation');
    } finally {
      try {
        releaseConsent?.(undefined);
        if (session) {
          await bounded(session.abort(), 'abort');
          if (work) await work.catch(error => { errors.push(error); });
          try {
            await bounded(session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }), 'stdio shutdown');
          } finally { session.dispose(); }
        }
        // Recover the owned pid even if startup failed before tool registration.
        const starts = (await audit()).filter(event => event.event === 'started');
        for (const start of starts) {
          assert.ok(Number.isInteger(start.pid) && start.pid > 0 && start.pid !== process.pid);
          await until(() => probeExited(start.pid), `owned stdio child ${start.pid} exit after session shutdown`);
        }
        assert.equal(networkAttempts, 0, 'no fetch, including during teardown');
      } finally {
        process.argv = savedArgv;
        globalThis.fetch = oldFetch;
        for (const key of Object.keys(process.env)) delete process.env[key];
        Object.assign(process.env, savedEnv);
        process.chdir(savedCwd);
        await rm(temp, { recursive: true, force: true });
      }
    }
  });
