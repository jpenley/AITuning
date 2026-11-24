import test from 'node:test';
import assert from 'node:assert/strict';
import { runGuest } from '../scripts/runtime.mjs';

test('filters large tool responses without exposing their contents', async () => {
  const result = await runGuest({ code: 'const r = await tools.call("Read", {file_path:"rows.json"}); return JSON.parse(r.text).length;', callTool: async () => ({ text: JSON.stringify(Array.from({length:250}, (_,id)=>({id,payload:'PRIVATE_SYNTHETIC_SENTINEL'.repeat(10)}))) }) });
  assert.equal(result.ok, true);
  assert.equal(result.value, 250);
  assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_SENTINEL'), false);
  assert.deepEqual(result.calls, [{ id:1, tool:'Read', status:'ok' }]);
});
test('keeps denied actions visible even when guest catches the error', async () => {
  const result = await runGuest({ code:'try { await tools.call("Write", {}); } catch (error) { emit("caught"); } return "ignored";', callTool: async () => ({ deny:'owner denied' }) });
  assert.equal(result.ok, false);
  assert.equal(result.value, 'ignored');
  assert.equal(result.calls[0].status, 'denied');
  assert.equal(result.calls[0].error, 'owner denied');
});
test('keeps tool failures and completed calls when a later call fails', async () => {
  const result = await runGuest({ code:'await tools.call("Read", {}); await tools.call("Write", {});', callTool:async r => r.id === 1 ? {text:'ok'} : {isError:true,text:'write failed'} });
  assert.equal(result.ok, false);
  assert.deepEqual(result.calls.map(c=>c.status), ['ok','error']);
});
test('guest has no Node, process, filesystem, network, timers, or imports', async () => {
  const r = await runGuest({ code:'return [typeof process, typeof require, typeof fetch, typeof setTimeout, typeof WebAssembly];', callTool:async()=>assert.fail('no calls expected') });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, Array(5).fill('undefined'));
  const imported = await runGuest({ code:'return await import("node:fs");', callTool:async()=>assert.fail('no calls expected') });
  assert.equal(imported.ok, false);
});
test('interrupts infinite guest computation and rejects oversized output', async () => {
  const loop = await runGuest({ code:'while(true) {}', timeoutMs:100, callTool:async()=>assert.fail('no calls expected') });
  assert.equal(loop.ok, false);
  const output = await runGuest({ code:'return "x".repeat(16001);', callTool:async()=>assert.fail('no calls expected') });
  assert.equal(output.ok, false);
  assert.match(output.error, /output limit/);
});
test('awaits outstanding calls and prevents a never-settling promise from hanging', async () => {
  let effects = 0;
  const r = await runGuest({ code:'tools.call("Read", {}); return 1;', callTool:async()=>{ await new Promise(resolve=>setTimeout(resolve,10)); effects++; return {text:'ok'}; } });
  assert.equal(r.ok, true);
  assert.equal(effects, 1);
  const hanging = await runGuest({ code:'await new Promise(()=>{});', callTool:async()=>assert.fail('no calls expected') });
  assert.equal(hanging.ok, false);
  assert.match(hanging.error,/unsettled promise/);
});
test('multibyte tool results respect the byte cap',async()=>{
  const r=await runGuest({code:'return await tools.call("Read",{});',callTool:async()=>({text:'界'.repeat(800000)})});
  assert.equal(r.ok,false);
  assert.match(r.calls[0].error,/exceeds 2 MiB/);
});
test('guest allocations cannot exceed the heap limit',async()=>{
  const r=await runGuest({code:'return new Uint8Array(64*1024*1024).byteLength;',callTool:async()=>assert.fail('no calls expected')});
  assert.equal(r.ok,false);
});
