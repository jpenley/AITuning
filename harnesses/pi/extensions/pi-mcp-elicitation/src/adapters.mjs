export const DISCOVER = 'pi:mcp-elicitation:discover.v1';
export const CHANGED = 'pi:mcp-elicitation:changed.v1';

/** In-process only: functions deliberately do not cross RPC or transcript boundaries. */
export function registerElicitationAdapter(pi, adapter) {
  if (!adapter || !/^[a-z][a-z0-9-]{0,63}$/u.test(adapter.id) || ['auto', 'native', 'rpiv'].includes(adapter.id) || adapter.version !== 1 || typeof adapter.supports !== 'function' || typeof adapter.collect !== 'function') throw new Error('Invalid elicitation adapter v1');
  let disposed = false;
  const lifetime = new AbortController();
  const registered = { ...adapter, async collect(input) {
    const signal = AbortSignal.any([input.signal, lifetime.signal]);
    signal.throwIfAborted();
    const result = await adapter.collect({ ...input, signal });
    signal.throwIfAborted();
    return result;
  } };
  const off = pi.events.on(DISCOVER, offer => {
    if (!disposed && offer?.version === 1 && typeof offer.register === 'function' && offer.signal instanceof AbortSignal && !offer.signal.aborted) offer.register(registered);
  });
  const shutdown = pi.on('session_shutdown', () => dispose());
  function dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    off(); shutdown();
    pi.events.emit(CHANGED, { version: 1 });
  }
  pi.events.emit(CHANGED, { version: 1 });
  return dispose;
}

export function discoverAdapters(pi, signal) {
  const adapters = new Map();
  let open = true, invalid = false;
  pi.events.emit(DISCOVER, { version: 1, signal, register(adapter) {
    if (!open || signal.aborted) return;
    if (!adapter || adapter.version !== 1 || !/^[a-z][a-z0-9-]{0,63}$/u.test(adapter.id) || ['auto', 'native', 'rpiv'].includes(adapter.id) || typeof adapter.supports !== 'function' || typeof adapter.collect !== 'function' || adapters.has(adapter.id)) {
      invalid = true;
      return;
    }
    adapters.set(adapter.id, adapter);
  } });
  open = false;
  if (invalid) throw new Error('Invalid or duplicate elicitation adapter registration');
  return adapters;
}
