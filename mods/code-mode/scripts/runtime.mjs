import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-singlefile-mjs-release-sync';

export async function runGuest({ code, catalog = [], callTool, timeoutMs = 30000 }) {
  if (typeof code !== 'string' || !code.trim() || code.length > 16384) throw new Error('code must contain 1-16384 characters');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) throw new Error('invalid timeout');
  const engine = await newQuickJSWASMModuleFromVariant(variant);
  const rt = engine.newRuntime();
  rt.setMemoryLimit(32 * 1024 * 1024);
  rt.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + timeoutMs;
  rt.setInterruptHandler(() => Date.now() > deadline);
  const vm = rt.newContext();
  const pending = new Set();
  const output = [];
  const calls = [];
  let outputChars = 0;
  let open = true;
  let root;
  const pump = () => {
    const jobs = rt.executePendingJobs();
    if (jobs.error) {
      const message = JSON.stringify(vm.dump(jobs.error));
      jobs.error.dispose();
      throw new Error(message);
    }
  };
  try {
    vm.newFunction('__emit', value => {
      const text = vm.getString(value);
      outputChars += text.length;
      if (outputChars > 16000 || output.length >= 100) throw new Error('output limit exceeded');
      output.push(text);
    }).consume(fn => vm.setProp(vm.global, '__emit', fn));
    vm.newFunction('__call', encoded => {
      if (!open || Date.now() > deadline || calls.length >= 32) throw new Error('execution closed, expired, or call limit exceeded');
      const request = vm.getString(encoded);
      if (request.length > 65536) throw new Error('tool arguments exceed limit');
      const { name, args } = JSON.parse(request);
      const record = { id: calls.length + 1, tool: name, status: 'pending' };
      calls.push(record);
      const deferred = vm.newPromise();
      const task = Promise.resolve().then(() => callTool({ id: record.id, name, args })).then(
        value => {
          if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 2 * 1024 * 1024) throw new Error('tool result exceeds 2 MiB');
          record.status = value.deny ? 'denied' : value.isError ? 'error' : 'ok';
          if (record.status !== 'ok') record.error = String(value.deny || value.text || 'tool failed').slice(0, 2000);
          const encodedValue = vm.newString(JSON.stringify(value));
          deferred.resolve(encodedValue);
          encodedValue.dispose();
        }
      ).catch(error => {
        record.status = 'error';
        record.error = String(error.message).slice(0, 2000);
        const handle = vm.newString(record.error);
        deferred.reject(handle);
        handle.dispose();
      }).finally(() => { deferred.dispose(); pending.delete(task); });
      pending.add(task);
      return deferred.handle;
    }).consume(fn => vm.setProp(vm.global, '__call', fn));
    const setup = vm.evalCode(`
      const emit = value => __emit(typeof value === 'string' ? value : JSON.stringify(value));
      const tools = Object.freeze({
        list: () => JSON.parse(${JSON.stringify(JSON.stringify(catalog))}),
        call: async (name, args = {}) => {
          const result = JSON.parse(await __call(JSON.stringify({name, args})));
          if (result.deny || result.isError) throw new Error(result.deny || result.text || 'tool failed');
          return result;
        }
      });
    `);
    vm.unwrapResult(setup).dispose();
    root = vm.unwrapResult(vm.evalCode(`(async () => { "use strict";\n${code}\n})().then(value => JSON.stringify(value === undefined ? null : value))`));
    let state;
    while (true) {
      if (Date.now() > deadline) throw new Error('guest deadline exceeded');
      pump();
      state = vm.getPromiseState(root);
      if (state.type !== 'pending') {
        open = false;
        if (!pending.size) break;
        if (state.value) state.value.dispose();
        if (state.error) state.error.dispose();
      }
      if (!pending.size) throw new Error('unsettled promise with no pending tool calls');
      await Promise.race([...pending, new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, deadline - Date.now()))))]);
    }
    if (state.type === 'rejected') {
      const message = JSON.stringify(vm.dump(state.error));
      state.error.dispose();
      throw new Error(message);
    }
    const encodedValue = vm.getString(state.value);
    state.value.dispose();
    if (encodedValue.length + outputChars > 16000) throw new Error('output limit exceeded');
    return { ok: calls.every(call => call.status === 'ok'), value: JSON.parse(encodedValue), output, calls };
  } catch (error) {
    return { ok: false, error: String(error.message).slice(0, 2000), output, calls };
  } finally {
    open = false;
    // The process boundary ends outstanding guest work; callers never replay effects.
    if (!pending.size) {
      root?.dispose();
      vm.dispose();
      rt.dispose();
    }
  }
}
