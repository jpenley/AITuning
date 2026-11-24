import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { register } from '../hooks/register.js';
import { register as reference } from './reference/register-0.2.mjs';

async function exercise(requests, underlying = async () => ({text:'ok'}), aborted = false, elapsedAfterCall = 0, options = {}) {
  let handler;
  (options.registration || register)((event, matcher, callback) => {
    if (event === 'tool.call') handler = callback;
    return {catch() { return this; }};
  });
  const dispatched=[];
  const replies=[];
  let settle;
  let index=0;
  let now=0;
  let clockCalls=0;
  const files=new Map();
  const paths=[];
  const processes=[];
  let sleeps=0;
  let waiting=options.waitPolls || 0;
  let frameIds=[];
  const done=()=>options.done || ({ok:replies.every(r=>!r.value.deny&&!r.value.isError),calls:[...replies].sort((a,b)=>a.id-b.id).map(r=>({id:r.id,status:r.value.deny?'denied':r.value.isError?'error':'ok'}))});
  const publish=()=>{
    if(waiting>0){waiting--;return;}
    if(frameIds.some(id=>!files.has(`reply-${id}.ready`)))return;
    const request=requests[index++];
    if(!request){files.set('done.json',JSON.stringify(done()));settle();return;}
    const batch=Array.isArray(request)?request:[request];
    frameIds=batch.map(r=>r.id);
    for(const item of batch){files.delete(`reply-${item.id}.ready`);files.set(`request-${item.id}.json`,JSON.stringify(item));}
  };
  const name=path=>{paths.push(path);assert.ok(path.startsWith('/temporary/'),'SDK transport stays inside its private mailbox');return path.slice('/temporary/'.length);};
  const $={
    plugin:{root:'/plugin'},clock:{now:async()=>now},ui:{log:()=>assert.fail('unexpected cleanup error')},
    fs:{
      exists:async path=>files.has(name(path)),
      list:async path=>{assert.equal(path,'/temporary');publish();const entries=[...files].map(([name,text])=>({name,kind:'file',isLink:false,size:Buffer.byteLength(text)}));if(new Set(frameIds).size!==frameIds.length)entries.push(entries.find(e=>e.name===`request-${frameIds[0]}.json`));return options.entries?options.entries(entries):entries;},
      read:async path=>{const key=name(path);assert.ok(files.has(key),'read only a published file');return files.get(key);},
      write:async(path,text)=>{
        const key=name(path);
        if(key===`reply-${options.failReplyId}.json`)throw new Error('synthetic reply transport failure');
        if(key===`reply-${options.failMarkerId}.ready`)throw new Error('synthetic commit transport failure');
        files.set(key,text);
        if(/^reply-\d+\.ready$/.test(key)){
          const reply=JSON.parse(files.get(key.replace('.ready','.json')));
          replies.push(reply);
          if(replies.length>=requests.flat().length)settle();
        }
      }
    },
    tool:{list:async()=>['Read','Grep','Glob','Write','Bash','mcp__test__read'].map(name=>({name,description:'read only',readOnlyHint:true})),call:async args=>{dispatched.push(args);const r=await underlying(args);options.mutateMailbox?.(files);now=elapsedAfterCall;return r;}},
    process:{run:async(argv,init)=>{
      const action=argv[2];
      processes.push(action);
      options.onProcess?.(action);
      let value;
      if(action==='init') value={dir:'/temporary',nonce:'owned'};
      else if(action==='run') return new Promise(resolve=>{settle=()=>resolve({exitCode:0,stdout:'{}',stderr:''});});
      else if(action==='next') {if(options.fsFallback){waiting=0;publish();value=files.has('done.json')?{done:done()}:{requests:frameIds.map(id=>JSON.parse(files.get(`request-${id}.json`)))};}else{const request=requests[index++];value=request?{requests:Array.isArray(request)?request:[request]}:{done:done()};if(!request)settle();}}
      else if(action==='reply') {const reply=JSON.parse(init.stdin);if(reply.id===options.failReplyId)throw new Error('synthetic reply transport failure');replies.push(reply);value={replied:true};if(replies.length>=requests.flat().length)settle();}
      else if(action==='cancel') {settle();value={cancelled:true};}
      else if(action==='cleanup') value={cleaned:true};
      else assert.fail('unexpected action '+action);
      return {exitCode:0,stdout:JSON.stringify(value),stderr:''};
    }}
  };
  $.clock.sleep=async ms=>{sleeps+=ms;};
  if(options.onClock)$.clock.now=async()=>{options.onClock(++clockCalls);return now;};
  const controller=typeof aborted==='boolean'?new AbortController():aborted;
  if(aborted===true) controller.abort();
  const answer=await handler($,{code:'return 1;'},{signal:controller.signal});
  return {answer:JSON.parse(answer.result),dispatched,replies,...(options.trace?{paths,processes,sleeps,files}:{} )};
}
test('passes original tool arguments to the host and preserves its denial',async()=>{
  const r=await exercise([{id:1,name:'Write',args:{file_path:'blocked.txt',content:'synthetic'}}],async()=>({deny:'permission rule blocked'}));
  assert.deepEqual(r.dispatched,[{tool:'Write',file_path:'blocked.txt',content:'synthetic'}]);
  assert.equal(r.answer.ok,false);
  assert.equal(r.replies[0].value.deny,'permission rule blocked');
});
test('independent reads overlap through the normal host dispatch',async()=>{
  let active=0,peak=0,started=0,release;
  const together=new Promise(resolve=>{release=resolve;});
  const r=await exercise([[{id:1,name:'Read',args:{file_path:'a'}},{id:2,name:'Read',args:{file_path:'b'}}]],async()=>{
    peak=Math.max(peak,++active);
    if(++started===2)release();
    let timer;
    try {
      await Promise.race([together,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('independent reads did not overlap')),500);})]);
      return {text:'ok'};
    } finally {clearTimeout(timer);active--;}
  });
  assert.equal(r.answer.ok,true,'both independent reads must start before either waits for its sibling');
  assert.equal(peak,2);
  assert.deepEqual(r.dispatched,[{tool:'Read',file_path:'a'},{tool:'Read',file_path:'b'}]);
});
test('known reads have a four-call cap while replies may finish out of order',async()=>{
  let active=0,peak=0;
  const requests=Array.from({length:12},(_,n)=>({id:n+1,name:['Read','Grep','Glob'][n%3],args:{file_path:String(n+1)}}));
  const r=await exercise([requests],async args=>{
    peak=Math.max(peak,++active);
    await new Promise(resolve=>setTimeout(resolve,Number(args.file_path)%2?12:2));
    active--;return {text:args.file_path};
  });
  assert.equal(r.answer.ok,true);
  assert.equal(peak,4);
  assert.equal(active,0);
  assert.deepEqual(r.dispatched.map(call=>Number(call.file_path)),Array.from({length:12},(_,n)=>n+1));
  assert.notDeepEqual(r.replies.map(reply=>reply.id),Array.from({length:12},(_,n)=>n+1));
});
test('mutations and unknown tools are barriers despite read-only descriptions or hints',async()=>{
  let reads=0,exclusive=0;
  const events=[];
  const names=['Read','Grep','Write','Glob','Read','Bash','Read','mcp__test__read','Read'];
  const r=await exercise([names.map((name,n)=>({id:n+1,name,args:{file_path:String(n+1)}}))],async args=>{
    const read=['Read','Grep','Glob'].includes(args.tool);
    assert.equal(exclusive,0,'nothing overlaps an exclusive action');
    if(read)reads++;else {assert.equal(reads,0,'exclusive action waits for all prior reads');exclusive++;}
    events.push('start:'+args.file_path);
    await new Promise(resolve=>setTimeout(resolve,3));
    events.push('end:'+args.file_path);
    if(read)reads--;else exclusive--;
    return {text:'ok'};
  });
  assert.equal(r.answer.ok,true);
  for(const barrier of [3,6,8]) {
    assert.ok(events.indexOf('start:'+barrier)>events.indexOf('end:'+(barrier-1)));
    assert.ok(events.indexOf('start:'+(barrier+1))>events.indexOf('end:'+barrier));
  }
});
test('parallel siblings preserve a denial, error, and successful receipt',async()=>{
  const r=await exercise([[1,2,3].map(id=>({id,name:'Read',args:{file_path:String(id)}}))],async args=>{
    if(args.file_path==='1')return {deny:'read permission refused'};
    if(args.file_path==='2')throw new Error('read tool failed');
    return {text:'ok'};
  });
  assert.equal(r.answer.ok,false);
  assert.deepEqual(r.answer.calls.map(call=>call.status),['denied','error','ok']);
  assert.match(r.replies.find(reply=>reply.id===1).value.deny,/permission refused/);
  assert.ok(r.replies.some(reply=>reply.value.text==='read tool failed'));
});
test('parallel duplicate IDs are reserved before dispatch and never replayed',async()=>{
  const request={id:1,name:'Read',args:{file_path:'a'}};
  const r=await exercise([[request,request]],async()=>{await new Promise(resolve=>setTimeout(resolve,5));return {text:'ok'};});
  assert.equal(r.dispatched.length,1);
  assert.equal(r.answer.ok,false);
  assert.match(r.answer.error,/duplicate request/);
  assert.deepEqual(r.answer.calls,[{id:1,tool:'Read',status:'ok'}]);
});
test('aborting an active read group stops queued reads and later mutations',async()=>{
  const controller=new AbortController();
  const requests=Array.from({length:6},(_,n)=>({id:n+1,name:n===5?'Write':'Read',args:{file_path:String(n+1)}}));
  const r=await exercise([requests],async args=>{
    await new Promise(resolve=>setTimeout(resolve,5));
    if(args.file_path==='1')controller.abort();
    return {text:'ok'};
  },controller);
  assert.equal(r.dispatched.length,4);
  assert.equal(r.answer.ok,false);
  assert.match(r.answer.error,/cancelled/);
  assert.equal(r.answer.calls.length,4);
  assert.ok(r.answer.calls.every(call=>call.status==='ok'));
});
test('cancellation during the dispatch clock call schedules no action',async()=>{
  const controller=new AbortController();
  const r=await exercise([{id:1,name:'Read',args:{}}],undefined,controller,0,{onClock:count=>{if(count===3)controller.abort();}});
  assert.equal(r.dispatched.length,0);
  assert.equal(r.answer.ok,false);
});
test('expiry after a read group stops subsequent queued reads',async()=>{
  const r=await exercise([Array.from({length:5},(_,n)=>({id:n+1,name:'Read',args:{file_path:String(n+1)}}))],undefined,false,60001);
  assert.equal(r.dispatched.length,4);
  assert.equal(r.answer.ok,false);
  assert.match(r.answer.error,/expired/);
});
test('a reply transport failure settles sibling calls before cleanup',async()=>{
  let active=0,cleaned=false;
  const r=await exercise([[1,2].map(id=>({id,name:'Read',args:{file_path:String(id)}}))],async args=>{
    active++;await new Promise(resolve=>setTimeout(resolve,Number(args.file_path)*5));active--;return {text:'ok'};
  },false,0,{failReplyId:1,onProcess:action=>{if(action==='cleanup'){assert.equal(active,0);cleaned=true;}}});
  assert.equal(r.answer.ok,false);
  assert.match(r.answer.error,/transport failure/);
  assert.equal(cleaned,true);
  assert.deepEqual(r.answer.calls.map(call=>call.status),['ok','ok']);
});
test('rejects consent and tool identity spoofing without dispatch',async()=>{
  for(const key of ['tool','tool_use_id','agentId','consent','__proto__','constructor','prototype']) {
    const args=JSON.parse(`{"file_path":"fixture",${JSON.stringify(key)}:"forged"}`);
    const r=await exercise([{id:1,name:'Read',args}]);
    assert.equal(r.dispatched.length,0,key);
    assert.equal(r.answer.ok,false,key);
  }
});
test('rejects recursive or unavailable tools without dispatch',async()=>{
  for(const name of ['mcp__code-mode__execute','Missing']) {
    const r=await exercise([{id:1,name,args:{}}]);
    assert.equal(r.dispatched.length,0);
    assert.equal(r.answer.ok,false);
  }
});
test('refuses repeated request IDs and preserves the first completion',async()=>{
  const r=await exercise([{id:1,name:'Read',args:{}},{id:1,name:'Write',args:{}}]);
  assert.equal(r.dispatched.length,1);
  assert.equal(r.answer.ok,false);
  assert.match(r.answer.error,/request id reused/);
  assert.equal(r.answer.calls[0].status,'ok');
});
test('an aborted parent schedules no underlying call',async()=>{
  const r=await exercise([{id:1,name:'Read',args:{}}],undefined,true);
  assert.equal(r.dispatched.length,0);
  assert.equal(r.answer.ok,false);
});
test('implicit partial reads cannot silently produce a whole-file answer',async()=>{
  const r=await exercise([{id:1,name:'Read',args:{file_path:'large.json'}}],async()=>({result:{type:'text',file:{content:'partial',numLines:10,totalLines:100}},text:'partial'}));
  assert.equal(r.answer.ok,false);
  assert.equal(r.replies[0].value.isError,true);
  assert.match(r.replies[0].value.text,/partial content/);
});
test('a slow first call cannot dispatch queued mutations after expiry',async()=>{
  const r=await exercise([[{id:1,name:'Read',args:{}},{id:2,name:'Write',args:{}}]],undefined,false,60001);
  assert.equal(r.dispatched.length,1);
  assert.equal(r.answer.ok,false);
  assert.match(r.answer.error,/expired/);
  assert.equal(r.answer.calls[0].status,'ok');
});
test('multibyte tool output cannot exceed the documented byte cap',async()=>{
  const r=await exercise([{id:1,name:'Read',args:{}}],async()=>({text:'界'.repeat(800000)}));
  assert.equal(r.answer.ok,false);
  assert.match(r.replies[0].value.text,/exceeded 2 MiB/);
});

// Seed and workload are fixed independently of the transport implementation.
test('characterization corpus preserves the frozen 0.2 results and permission dispatch',async()=>{
  let seed=20261016;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const cases=[[],[{id:1,name:'Read',args:{file_path:'界'}}],[{id:1,name:'Read',args:{}},{id:1,name:'Write',args:{}}]];
  for(let n=0;n<100;n++)cases.push([Array.from({length:1+random()%12},(_,i)=>({id:i+1,name:['Read','Grep','Glob','Write','Bash','mcp__test__read','Missing'][random()%7],args:random()%5===0?{consent:'forged'}:{file_path:String(random()%4)}}))]);
  const underlying=async args=>args.file_path==='0'?{deny:'frozen permission refusal'}:args.file_path==='1'?{isError:true,text:'frozen tool error'}:{text:args.file_path||'ok'};
  const expected=[];
  for(const requests of cases)expected.push(await exercise(requests,underlying,false,0,{registration:reference}));
  const path=new URL('./reference/host-golden.json',import.meta.url);
  if(process.env.CODE_MODE_RECORD_GOLDEN==='1')writeFileSync(path,JSON.stringify({seed:20261016,cases,expected})+'\n');
  const golden=JSON.parse(readFileSync(path,'utf8'));
  assert.deepEqual(cases,golden.cases);
  assert.deepEqual(expected,golden.expected,'frozen reference remains the recorded oracle');
  for(let i=0;i<cases.length;i++)assert.deepEqual(await exercise(cases[i],underlying),golden.expected[i],`corpus case ${i}`);
});

test('fast transport uses no per-request processes or successful-run cancellation',async()=>{
  const r=await exercise([[1,2,3,4].map(id=>({id,name:'Read',args:{file_path:`/user/${id}`}}))],undefined,false,0,{trace:true});
  assert.equal(r.answer.ok,true);
  assert.deepEqual(r.processes,['init','run','cleanup']);
  assert.ok(r.paths.every(path=>path.startsWith('/temporary/')));
});

test('commit failure remains visible and does not acknowledge the failed reply',async()=>{
  const r=await exercise([{id:1,name:'Read',args:{}}],undefined,false,0,{trace:true,failMarkerId:1});
  assert.equal(r.answer.ok,false);
  assert.match(r.answer.error,/commit transport failure/);
  assert.equal(r.replies.length,0);
  assert.equal(r.files.has('reply-1.ready'),false);
  assert.ok(r.processes.includes('cancel'));
});

test('long waits fall back to blocking transport after at most 250ms of SDK sleeps',async()=>{
  const r=await exercise([{id:1,name:'Read',args:{}}],undefined,false,0,{trace:true,waitPolls:100,fsFallback:true});
  assert.equal(r.answer.ok,true);
  assert.equal(r.sleeps,250);
  assert.ok(r.processes.includes('next'));
});

test('large final receipts retain the original process transport',async()=>{
  const r=await exercise([{id:1,name:'Read',args:{}}],undefined,false,0,{trace:true,fsFallback:true,entries:entries=>entries.map(entry=>entry.name==='done.json'?{...entry,size:400000}:entry)});
  assert.equal(r.answer.ok,true);
  assert.ok(r.processes.includes('next'));
});

test('invalid mailbox request files fail before permission dispatch',async()=>{
  for(const altered of [{isLink:true},{kind:'directory'},{size:300001}]) {
    const r=await exercise([{id:1,name:'Read',args:{}}],undefined,false,0,{entries:entries=>entries.map(entry=>entry.name==='request-1.json'?{...entry,...altered}:entry)});
    assert.equal(r.answer.ok,false);
    assert.match(r.answer.error,/invalid mailbox frame/);
    assert.equal(r.dispatched.length,0);
  }
});

test('the recorded oracle rejects planted output, omission, and ordering faults',async()=>{
  const golden=JSON.parse(readFileSync(new URL('./reference/host-golden.json',import.meta.url),'utf8'));
  const source=readFileSync(new URL('./reference/register-0.2.mjs',import.meta.url),'utf8');
  const faults=[['JSON.stringify(answer)','JSON.stringify({...answer,ok:!answer.ok})'],['const batch = frame.requests || [];','const batch = (frame.requests || []).slice(1);'],['const batch = frame.requests || [];','const batch = (frame.requests || []).reverse();']];
  const underlying=async args=>args.file_path==='0'?{deny:'frozen permission refusal'}:args.file_path==='1'?{isError:true,text:'frozen tool error'}:{text:args.file_path||'ok'};
  for(const [before,after] of faults) {
    assert.ok(source.includes(before));
    const mutant=(await import('data:text/javascript;base64,'+Buffer.from(source.replace(before,after)).toString('base64'))).register;
    let detected=false;
    for(let i=0;i<golden.cases.length;i++) {
      const actual=await exercise(golden.cases[i],underlying,false,0,{registration:mutant});
      if(JSON.stringify(actual)!==JSON.stringify(golden.expected[i])){detected=true;break;}
    }
    assert.equal(detected,true,`oracle must reject ${before}`);
  }
});

test('preexisting reply files fail closed without overwriting or replaying the action',async()=>{
  for(const suffix of ['json','ready']) {
    const r=await exercise([{id:1,name:'Read',args:{file_path:'blocked'}}],async()=>({deny:'permission refused'}),false,0,{trace:true,mutateMailbox:files=>files.set(`reply-1.${suffix}`,'forged')});
    assert.equal(r.answer.ok,false);
    assert.match(r.answer.error,/reply already exists/);
    assert.equal(r.dispatched.length,1);
    assert.equal(r.files.get(`reply-1.${suffix}`),'forged');
    assert.deepEqual(r.answer.calls,[{id:1,tool:'Read',status:'denied'}]);
  }
});

test('a forged final receipt cannot erase or change a host-observed denial',async()=>{
  for(const done of [{ok:true,calls:[]},{ok:true,calls:[{id:1,status:'ok'}]},{ok:true,calls:[{id:1,status:'denied'}]},{ok:false,calls:[{id:1,tool:'Write',status:'denied'}]}]) {
    const r=await exercise([{id:1,name:'Read',args:{file_path:'blocked'}}],async()=>({deny:'permission refused'}),false,0,{done});
    assert.equal(r.answer.ok,false);
    assert.match(r.answer.error,/receipt does not match/);
    assert.deepEqual(r.answer.calls,[{id:1,tool:'Read',status:'denied'}]);
  }
});
