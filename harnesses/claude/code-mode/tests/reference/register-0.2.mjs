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
      protocol(await $.process.run([...executable, 'reply', ...route], { stdin: JSON.stringify({ id: request.id, value }) }));
    };
    let answer;
    while (!answer) {
      if (next.signal.aborted || (await $.clock.now()) > deadline) throw new Error('Code-mode cancelled or expired; completed effects are not rolled back');
      const frame = protocol(await $.process.run([...executable, 'next', ...route], { timeoutMs: 3000 }));
      if (frame.done) { answer = frame.done; break; }
      if (job) throw new Error(job.error || 'Code-mode helper exited without a final result');
      const batch = frame.requests || [];
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
    return { result: JSON.stringify(answer) };
  } catch (error) {
    return { result: JSON.stringify({ ok: false, error: String(error.message), calls: [...completed.entries()].sort((a, b) => a[0] - b[0]).map(([id, record]) => ({ id, tool: record.tool, status: record.status })), note: 'Effects are real, are not rolled back, and must not be retried automatically.' }) };
  } finally {
    active = false;
    // A guest deadline stops scheduling. Underlying tools retain host cancellation semantics.
    try { await $.process.run([...executable, 'cancel', ...route]); }
    catch (error) { $.ui.log('Code-mode cancellation cleanup failed: ' + String(error.message)); }
    if (settled) await settled;
    if (job) {
      try { await $.process.run([...executable, 'cleanup', ...route]); }
      catch (error) { $.ui.log('Code-mode mailbox cleanup failed: ' + String(error.message)); }
    }
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'execute', isDeferred: false,
      description: 'Run JavaScript to compose existing tools and filter large results before they enter context. Use await tools.call("Read", {file_path:"..."}); results have text/result fields. tools.list() lists names/descriptions; use existing tool schemas or ToolSearch for unfamiliar schemas. Return a small JSON value or emit(value). Every underlying call keeps its normal permissions. Use Promise.all for independent Read/Grep/Glob calls (up to 4 at once); await dependencies. All other tools are sequential barriers. Await all calls, and await reads before dependent mutations. No Node, imports, filesystem, network, timers, or persistent state in the guest. Limits: 32 calls, 60s, 32MiB guest memory, 16000 output characters. Effects are real and not rolled back on error. Use direct tools for simple calls or images/interactive capabilities.',
      inputSchema: { type: 'object', properties: { code: { type: 'string', minLength: 1, maxLength: 16384 } }, required: ['code'], additionalProperties: false },
    });
    return next(e);
  });
  on('tool.call', { tool: 'mcp__code-mode__execute' }, async ($, e, next) => {
    return run($, e, next);
  }).catch(($, e, next) => ({ deny: 'Code-mode failed closed: ' + next.error.message }));
}
