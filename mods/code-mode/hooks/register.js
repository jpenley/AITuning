const SELF = 'mcp__code-mode__';
const RESERVED = ['tool', 'tool_use_id', 'agentId', 'consent', '__proto__', 'constructor', 'prototype'];
const PARALLEL_READS = new Set(['Read', 'Grep', 'Glob']);
const READ_CONCURRENCY = 4;

function protocol(result) {
  if (result.exitCode !== 0) throw new Error('Code-mode helper failed: ' + result.stderr.slice(0, 1000));
  return JSON.parse(result.stdout);
}

async function run($, e, next) {
  if (typeof e.code !== 'string' || !e.code.trim() || e.code.length > 16384) return { result: JSON.stringify({ ok: false, error: 'code must contain 1-16384 characters' }) };
  const catalog = (await $.tool.list()).filter(t => !t.name.startsWith(SELF)).map(t => ({ name: t.name, description: t.description.slice(0, 400) }));
  const executable = ['node', $.plugin.root + '/dist/broker.mjs'];
  const owner = protocol(await $.process.run([...executable, 'init']));
  const route = [owner.dir, owner.nonce];
  let job;
  let settled;
  let active = true;
  const completed = new Map();
  const deadline = (await $.clock.now()) + 60000;
  try {
    const running = $.process.run([...executable, 'run', ...route], { stdin: JSON.stringify({ code: e.code, catalog }), timeoutMs: 70000 });
    // Observe rejection immediately while other broker requests are in flight.
    settled = running.then(value => { job = { value }; }, error => { job = { error: String(error.message) }; });
    let sleepMs = 0;
    const readFrame = async () => {
      const entries = await $.fs.list(owner.dir);
      const readJson = async entry => {
        if (entry.kind !== 'file' || entry.isLink || !Number.isInteger(entry.size) || entry.size < 0 || entry.size > 300000) throw new Error('invalid mailbox frame');
        const text = await $.fs.read(owner.dir + '/' + entry.name);
        if (new TextEncoder().encode(text).length > 300000) throw new Error('mailbox frame exceeds limit');
        return JSON.parse(text);
      };
      const done = entries.find(entry => entry.name === 'done.json');
      // Large diagnostic receipts retain the existing process transport; the
      // SDK filesystem has a per-file cap that the old transport did not use.
      if (done && done.size > 300000) return protocol(await $.process.run([...executable, 'next', ...route], { timeoutMs: 3000 }));
      if (done) return { done: await readJson(done) };
      const ready = new Set(entries.map(entry => entry.name));
      const pending = entries.filter(entry => /^request-\d+\.json$/.test(entry.name) && !ready.has(entry.name.replace('request-', 'reply-').replace('.json', '.ready'))).sort((a, b) => Number(a.name.slice(8, -5)) - Number(b.name.slice(8, -5)));
      if (pending.length > 32) throw new Error('broker call limit exceeded');
      const requests = [];
      for (const entry of pending) requests.push(await readJson(entry));
      return { requests };
    };
    const dispatch = async request => {
      const dispatchNow = await $.clock.now();
      if (next.signal.aborted || !active || dispatchNow > deadline || job) throw new Error('Code-mode cancelled, expired, or stopped before tool dispatch');
      if (!Number.isInteger(request.id) || request.id < 1 || request.id > 32) throw new Error('invalid request id');
      const identity = JSON.stringify(request);
      if (completed.has(request.id)) {
        if (completed.get(request.id).identity !== identity) throw new Error('request id reused with different arguments');
        throw new Error('duplicate request; refusing to repeat an action');
      }
      // Reserve before the first action so duplicate in-flight IDs cannot dispatch twice.
      const record = { identity, tool: request.name, status: 'pending' };
      completed.set(request.id, record);
      const args = request.args;
      let value;
      if (typeof request.name !== 'string' || request.name.startsWith(SELF) || !catalog.some(t => t.name === request.name)) value = { deny: 'Tool is unavailable or recursive: ' + request.name };
      else if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => RESERVED.includes(key))) value = { deny: 'Tool arguments must be an object without reserved metadata' };
      else {
        try { value = await $.tool.call({ ...args, tool: request.name }); }
        catch (error) { value = { isError: true, text: String(error.message) }; }
      }
      const file = value.result && value.result.file;
      if (request.name === 'Read' && file && Number.isInteger(file.numLines) && Number.isInteger(file.totalLines) && file.numLines < file.totalLines && args.offset === undefined && args.limit === undefined) {
        value = { ...value, isError: true, text: 'Read returned partial content (' + file.numLines + '/' + file.totalLines + ' lines). Read explicit offset/limit ranges before computing a whole-file answer.' };
      }
      if (new TextEncoder().encode(JSON.stringify(value)).length > 2 * 1024 * 1024) value = { isError: true, text: 'Tool output exceeded 2 MiB; request a smaller range or query' };
      record.status = value.deny ? 'denied' : value.isError ? 'error' : 'ok';
      // The broker ignores the JSON until the complete write is committed.
      const reply = owner.dir + '/reply-' + request.id;
      const existing = await Promise.allSettled(['.json', '.ready'].map(suffix => $.fs.exists(reply + suffix)));
      for (const check of existing) {
        if (check.status === 'rejected') throw check.reason;
        if (check.value) throw new Error('reply already exists; refusing duplicate');
      }
      await $.fs.write(reply + '.json', JSON.stringify({ id: request.id, value }));
      await $.fs.write(reply + '.ready', 'ready');
    };
    let answer;
    while (!answer) {
      if (next.signal.aborted || (await $.clock.now()) > deadline) throw new Error('Code-mode cancelled or expired; completed effects are not rolled back');
      let frame = await readFrame();
      // A process may finish between the directory listing and its completion callback.
      if (job && !frame.done) frame = await readFrame();
      if (frame.done) { answer = frame.done; break; }
      if (job) throw new Error(job.error || 'Code-mode helper exited without a final result');
      const batch = frame.requests || [];
      if (!batch.length) {
        // SDK sleeps count against the hook's own 10s budget. Bound them across
        // the entire run, then let a blocking helper wait outside that budget.
        if (sleepMs < 250) { await $.clock.sleep(10); sleepMs += 10; }
        else {
          frame = protocol(await $.process.run([...executable, 'next', ...route], { timeoutMs: 3000 }));
          if (frame.done) { answer = frame.done; break; }
          batch.push(...(frame.requests || []));
        }
      }
      if (batch.length > 32) throw new Error('broker call limit exceeded');
      // Only contiguous known reads overlap. Every other action is a full barrier.
      for (let index = 0; index < batch.length;) {
        const group = [batch[index++]];
        if (PARALLEL_READS.has(group[0].name)) {
          while (index < batch.length && group.length < READ_CONCURRENCY && PARALLEL_READS.has(batch[index].name)) group.push(batch[index++]);
        }
        // Settle siblings even on a transport failure before cancellation or cleanup.
        const outcomes = await Promise.allSettled(group.map(dispatch));
        const failed = outcomes.find(outcome => outcome.status === 'rejected');
        if (failed) throw failed.reason;
      }
    }
    await settled;
    if (job.error || job.value.exitCode !== 0) throw new Error(job.error || 'Code-mode runner failed after execution');
    // Mailbox data cannot erase an action or denial observed by this host.
    const receipts = [...completed.entries()].sort((a, b) => a[0] - b[0]);
    if (!Array.isArray(answer.calls) || answer.calls.length !== receipts.length || answer.calls.some((call, index) => {
      const [id, record] = receipts[index];
      return !call || call.id !== id || call.status !== record.status || (call.tool !== undefined && call.tool !== record.tool);
    }) || (receipts.some(([, record]) => record.status !== 'ok') && answer.ok !== false)) throw new Error('Code-mode broker receipt does not match completed host actions');
    return { result: JSON.stringify(answer) };
  } catch (error) {
    return { result: JSON.stringify({ ok: false, error: String(error.message), calls: [...completed.entries()].sort((a, b) => a[0] - b[0]).map(([id, record]) => ({ id, tool: record.tool, status: record.status })), note: 'Effects are real, are not rolled back, and must not be retried automatically.' }) };
  } finally {
    active = false;
    // A guest deadline stops scheduling. Underlying tools retain host cancellation semantics.
    if (!job) {
      try { await $.process.run([...executable, 'cancel', ...route]); }
      catch (error) { $.ui.log('Code-mode cancellation cleanup failed: ' + String(error.message)); }
    }
    if (settled) await settled;
    if (job) {
      try { await $.process.run([...executable, 'cleanup', ...route]); }
      catch (error) { $.ui.log('Code-mode mailbox cleanup failed: ' + String(error.message)); }
    }
  }
}

// Bridge for the mcpx CLI: serves list/call requests from a spool directory so a
// shell command can use this session's MCP tools. A mod cannot listen on a
// socket, so a timer polls the directory. Every call goes through $.tool.call,
// which keeps the permission check, its dialog and other plugins' hooks.
const POLL_MS = 150;
const BEAT_MS = 2000;
const FRAME_LIMIT = 250000;
const bytes = text => new TextEncoder().encode(text).length;

async function reply($, cli, dir, id, value) {
  const body = JSON.stringify({ id, value });
  if (bytes(body) > FRAME_LIMIT) {
    await $.process.run(['node', cli, 'reply', dir, id], { stdin: body, timeoutMs: 10000 });
    return;
  }
  // The CLI ignores the reply until the marker exists, after the full write.
  await $.fs.write(`${dir}/res-${id}.json`, body);
  await $.fs.write(`${dir}/res-${id}.ready`, 'ready');
}

async function serve($, request) {
  if (request.op === 'list') {
    const tools = (await $.tool.list()).filter(t => t.mcp && !t.name.startsWith(SELF));
    return { tools: tools.map(t => ({ name: t.name, description: String(t.description).slice(0, 400) })) };
  }
  if (request.op !== 'call') return { deny: 'Unknown operation: ' + request.op };
  const { tool, args } = request;
  if (typeof tool !== 'string' || !tool.startsWith('mcp__') || tool.startsWith(SELF)) return { deny: 'mcpx only calls MCP tools; use the direct tool for ' + tool };
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => RESERVED.includes(key))) return { deny: 'Tool arguments must be an object without reserved metadata' };
  if (!(await $.tool.list()).some(t => t.name === tool)) return { deny: 'Tool is not available in this session: ' + tool };
  try { return await $.tool.call({ ...args, tool }); }
  catch (error) { return { isError: true, text: String(error.message) }; }
}

async function startBridge($) {
  const cli = $.plugin.root + '/cli/mcpx.mjs';
  let session;
  try {
    const init = await $.process.run(['node', cli, 'serve-init', await $.session.cwd()]);
    if (init.exitCode !== 0) throw new Error(init.stderr.slice(0, 300));
    session = JSON.parse(init.stdout);
  } catch (error) {
    // Without the bridge, direct tools and the execute tool still work.
    $.ui.log('mcpx bridge unavailable: ' + String(error.message));
    return;
  }
  const { dir } = session;
  const beat = async () => $.fs.write(dir + '/heartbeat.json', JSON.stringify({ at: await $.clock.now() }));
  await beat();
  $.clock.every(BEAT_MS, () => { beat().catch(() => {}); });
  // A permission dialog can hold one call open, so later requests wait their turn.
  let busy = false;
  $.clock.every(POLL_MS, async () => {
    if (busy) return;
    busy = true;
    try {
      const entries = await $.fs.list(dir);
      const done = new Set(entries.map(entry => entry.name));
      const pending = entries.filter(entry => /^req-[0-9a-f-]{36}\.json$/.test(entry.name) && !done.has(entry.name.replace('req-', 'res-').replace('.json', '.ready')));
      for (const entry of pending) {
        if (entry.kind !== 'file' || entry.isLink || entry.size > 300000) continue;
        let request;
        try { request = JSON.parse(await $.fs.read(dir + '/' + entry.name)); } catch { continue; }
        const id = request.id;
        if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || `req-${id}.json` !== entry.name) continue;
        const value = await serve($, request);
        $.ui.log(`mcpx ${request.op}${request.tool ? ' ' + request.tool : ''}: ${value.deny ? 'denied' : value.isError ? 'error' : 'ok'}`);
        await reply($, cli, dir, id, value);
      }
    } catch (error) {
      $.ui.log('mcpx bridge error: ' + String(error.message));
    } finally {
      busy = false;
    }
  });
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    // The bridge registers no tool, so it still works where policy refuses tool registration.
    await startBridge($);
    try {
    await $.tool.register({
      name: 'execute', isDeferred: false,
      description: 'Run JavaScript to compose existing tools and filter large results before they enter context. Use await tools.call("Read", {file_path:"..."}); results have text/result fields. tools.list() lists names/descriptions; use existing tool schemas or ToolSearch for unfamiliar schemas. Return a small JSON value or emit(value). Every underlying call keeps its normal permissions. Use Promise.all for independent Read/Grep/Glob calls (up to 4 at once); await dependencies. All other tools are sequential barriers. Await all calls, and await reads before dependent mutations. No Node, imports, filesystem, network, timers, or persistent state in the guest. Limits: 32 calls, 60s, 32MiB guest memory, 16000 output characters. Effects are real and not rolled back on error. Use direct tools for simple calls or images/interactive capabilities.',
      inputSchema: { type: 'object', properties: { code: { type: 'string', minLength: 1, maxLength: 16384 } }, required: ['code'], additionalProperties: false },
    });
    } catch (error) {
      $.ui.log('code-mode execute tool unavailable: ' + String(error.message));
    }
    return next(e);
  });
  on('tool.call', { tool: 'mcp__code-mode__execute' }, async ($, e, next) => {
    return run($, e, next);
  }).catch(($, e, next) => ({ deny: 'Code-mode failed closed: ' + next.error.message }));
}
