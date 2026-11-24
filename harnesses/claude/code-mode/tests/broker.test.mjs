import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('../dist/broker.mjs', import.meta.url));
const call = (action, owner, input) => new Promise((resolve,reject) => {
  const child = spawn(process.execPath, [script, action, ...(owner ? [owner.dir,owner.nonce] : [])], {windowsHide:true});
  let stdout='', stderr='';
  child.stdout.on('data',part=>stdout+=part);
  child.stderr.on('data',part=>stderr+=part);
  child.on('error',reject);
  child.on('exit',code=>code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(stderr)));
  child.stdin.end(input === undefined ? '' : JSON.stringify(input));
});
test('mailbox executes dependent calls once and cleans its owned directory', async () => {
  const owner = await call('init');
  const running = call('run',owner,{code:'const a=await tools.call("Read",{file_path:"a"}); return (await tools.call("Read",{file_path:a.text})).text;',catalog:[]});
  for (const expected of [1,2]) {
    let frame;
    do { frame=await call('next',owner); } while(frame.waiting);
    assert.equal(frame.requests[0].id,expected);
    if (expected===2) assert.equal(frame.requests[0].args.file_path,'b');
    await call('reply',owner,{id:expected,value:{text:expected===1?'b':'done'}});
    await assert.rejects(call('reply',owner,{id:expected,value:{text:'again'}}),/duplicate/);
  }
  await running;
  const frame = await call('next',owner);
  assert.equal(frame.done.ok,true);
  assert.equal(frame.done.value,'done');
  await call('cleanup',owner);
  assert.equal(existsSync(owner.dir),false);
});
test('wrong owner cannot read or remove a mailbox', async () => {
  const owner = await call('init');
  await assert.rejects(call('cleanup',{...owner,nonce:'wrong'}),/owner/);
  assert.equal(existsSync(owner.dir),true);
  await call('cleanup',owner);
});
test('a simultaneous twelve-call batch keeps numeric guest order', async () => {
  const owner=await call('init');
  const running=call('run',owner,{code:'return await Promise.all(Array.from({length:12},(_,n)=>tools.call("Read",{file_path:String(n+1)})));',catalog:[]});
  const seen=[];
  while(seen.length<12) {
    const frame=await call('next',owner);
    if(frame.waiting)continue;
    assert.ok(frame.requests,'expected pending requests');
    for(const request of frame.requests) {
      seen.push(request.id);
      await call('reply',owner,{id:request.id,value:{text:request.args.file_path}});
    }
  }
  await running;
  assert.deepEqual(seen,Array.from({length:12},(_,n)=>n+1));
  await call('cleanup',owner);
});
test('cancellation stops a pending guest and records no success', async () => {
  const owner = await call('init');
  const running = call('run',owner,{code:'await tools.call("Read",{}); return "never";',catalog:[]});
  let frame;
  do { frame=await call('next',owner); } while(frame.waiting);
  await call('cancel',owner);
  await running;
  const done = await call('next',owner);
  assert.equal(done.done.ok,false);
  assert.match(done.done.error,/cancelled/);
  await call('cleanup',owner);
});

test('an uncommitted reply cannot be consumed, then a committed envelope is checked', async () => {
  const owner=await call('init');
  const running=call('run',owner,{code:'return (await tools.call("Read",{})).text;',catalog:[]});
  try {
    let frame;
    do {frame=await call('next',owner);}while(frame.waiting);
    writeFileSync(join(owner.dir,'reply-1.json'),'{');
    await new Promise(resolve=>setTimeout(resolve,70));
    assert.equal(existsSync(join(owner.dir,'done.json')),false,'partial reply must remain invisible');
    writeFileSync(join(owner.dir,'reply-1.json'),JSON.stringify({id:2,value:{text:'wrong identity'}}));
    writeFileSync(join(owner.dir,'reply-1.ready'),'ready');
    await running;
    const result=await call('next',owner);
    assert.equal(result.done.ok,false);
    assert.match(result.done.calls[0].error,/reply id/);
  } finally {
    await call('cancel',owner);
    await running;
    await call('cleanup',owner);
  }
});
