import { bounded, display, fail, object, parseRequest, validateContent } from './form.mjs';
import { check, dialog, knownRpiv, nativeCollect, rpivCollect, rpivPlan } from './providers.mjs';
import { discoverAdapters } from './adapters.mjs';
export { registerElicitationAdapter } from './adapters.mjs';

const parameters = { type: 'object', additionalProperties: false, properties: {
  server: { type: 'string' }, source: { type: 'string' }, request: { type: 'object', additionalProperties: false, properties: { mode: { const: 'form', type: 'string' }, message: { type: 'string' }, requestedSchema: { type: 'object', additionalProperties: true } }, required: ['message', 'requestedSchema'] },
}, required: ['server', 'source', 'request'] };
const flat = { anyOf: [{ type: 'string' }, { type: 'boolean' }, { type: 'number' }, { type: 'array', items: { type: 'string' } }] };
export const outputSchema = { type: 'object', additionalProperties: false, properties: { action: { type: 'string', enum: ['accept', 'decline', 'cancel'] }, content: { type: 'object', additionalProperties: flat } }, required: ['action'] };
function result(action, content) {
  const structuredContent = action === 'accept' ? { action, content } : { action };
  return { content: [{ type: 'text', text: 'MCP elicitation finished. Answers are withheld from the transcript.' }], details: undefined, structuredContent };
}

/** One coordinator per extension runtime; one FIFO UI lane across the session. */
export function registerElicitation(pi, options = {}) {
  const initialProvider = options.provider ?? process.env.PI_MCP_ELICITATION_PROVIDER ?? 'auto';
  let provider = initialProvider;
  let lastSelection = 'none';
  let lifetime = new AbortController(), tail = Promise.resolve(), closed = false;
  function invalidate(final = false) {
    lifetime.abort();
    lifetime = new AbortController();
    closed = final;
    provider = initialProvider;
    lastSelection = 'none';
    // Keep tail: old dialogs must actually close before any new session interaction opens.
  }
  pi.on('session_start', () => invalidate());
  pi.on('session_before_switch', () => invalidate());
  pi.on('session_before_fork', () => invalidate());
  pi.on('session_before_tree', () => invalidate());
  pi.on('session_shutdown', () => invalidate(true));
  pi.registerCommand('mcp-elicitation-provider', {
    description: 'Select an MCP elicitation collector: auto, native, rpiv, or a registered adapter ID (session only).',
    handler: async (args, ctx) => {
      const selected = args.trim();
      if (!selected) {
        ctx.ui.notify(`MCP elicitation provider: ${display(provider)}; last collector: ${display(lastSelection)}`, 'info');
        return;
      }
      if (!/^[a-z][a-z0-9-]{0,63}$/u.test(selected)) throw new Error('Specify an elicitation provider ID.');
      provider = selected;
      ctx.ui.notify(`MCP elicitation provider: ${display(selected)}`, 'info');
    },
  });
  pi.registerTool({ name: 'mcp_elicitation_v1', label: 'MCP elicitation', description: 'Native MCP form elicitation companion. Collects validated values with explicit user consent; answers are not transcript content.', exposure: 'codemode', parameters, outputSchema,
    reachesTools: () => ['ask_user_question'],
    async execute(callId, input, operationSignal, _onUpdate, ctx) {
      const form = parseRequest(input);
      if (closed || !ctx?.hasUI || !['tui', 'rpc'].includes(ctx.mode) || typeof ctx.ui?.select !== 'function' || typeof ctx.ui?.input !== 'function') throw new Error('MCP elicitation requires a supported UI session.');
      const signal = AbortSignal.any([lifetime.signal, operationSignal, ctx.signal].filter(Boolean));
      const preceding = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      // An aborted waiter returns promptly, but its FIFO slot remains chained to its predecessor.
      let abortListener;
      try {
        await Promise.race([preceding, new Promise((_, reject) => {
          abortListener = () => reject(new DOMException('Elicitation cancelled', 'AbortError'));
          signal.addEventListener('abort', abortListener, { once: true });
          if (signal.aborted) abortListener();
        })]);
        check(signal);
        const adapters = discoverAdapters(pi, signal);
        let selected = provider;
        if (!['auto', 'native', 'rpiv'].includes(selected) && !adapters.has(selected)) throw new Error('Unknown MCP elicitation provider.');
        const plan = rpivPlan(form);
        const rpivAvailable = plan && await knownRpiv(pi, ctx);
        check(signal);
        const supported = [...adapters.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).filter(a => a.supports({ form, ctx }) === true);
        if (selected === 'auto') selected = rpivAvailable ? 'rpiv' : supported[0]?.id ?? 'native';
        // Select fallback before any collection starts. Never retry after any provider runs.
        if (selected === 'rpiv' && !rpivAvailable) selected = 'native';
        if (adapters.has(selected) && !supported.some(a => a.id === selected)) selected = 'native';
        lastSelection = selected;
        const collected = selected === 'rpiv' ? await rpivCollect({ pi, ctx, signal, callId, plan }) : selected === 'native' ? await nativeCollect({ form, ctx, signal }) : await adapters.get(selected).collect({ form, ctx, signal, callId });
        check(signal);
        // The envelope is bounded separately; content keeps its full 64-KiB budget.
        bounded(collected, 65536 + 64);
        if (!object(collected) || Object.keys(collected).some(k => !['cancelled', 'content'].includes(k)) || (collected.cancelled !== undefined && typeof collected.cancelled !== 'boolean')) fail();
        if (collected.cancelled === true) return result('cancel');
        const content = validateContent(form, collected.content);
        // Snapshot before review: no adapter can mutate values while consent is pending.
        const snapshot = JSON.parse(JSON.stringify(content));
        const summary = form.fields.map(f => `${display(f.name)} = ${Object.hasOwn(snapshot, f.name) ? display(JSON.stringify(snapshot[f.name])) : '(omitted)'}`).join('\n');
        const action = await dialog(ctx, signal, 'select', `MCP elicitation: final consent\nServer: ${display(form.server)}\nSource: ${display(form.source)}\nRequest (untrusted): ${display(form.message)}\nValues to send:\n${summary}\nAccept sends these values to this server.`, ['Accept', 'Decline', 'Cancel']);
        if (action === 'Accept') return result('accept', snapshot);
        if (action === 'Decline') return result('decline');
        if (action === undefined || action === 'Cancel') return result('cancel');
        fail();
      } catch (error) {
        if (signal.aborted) return result('cancel');
        // Do not echo provider errors or user values into model-visible failures.
        throw new Error('MCP elicitation failed technically; no values were accepted.');
      } finally {
        if (abortListener) signal.removeEventListener('abort', abortListener);
        preceding.then(release);
      }
    },
  });
}
