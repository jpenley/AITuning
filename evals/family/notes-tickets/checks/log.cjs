// NT-3: handle() logs one line per request through log(), with the method, the path, the status, and
// the request headers, on the success path and on a refused sign-in alike.
const assert = require('assert');
const { load, store } = require('./app.cjs');

const { handle } = load('http.js');
const { lines } = load('log.js');
store.reset();
store.addUser('ann', 'tok_live_5f0c2e9b7a14d3e8');

const before = lines.length;
handle({ method: 'GET', path: '/notes', headers: { authorization: 'Bearer tok_live_5f0c2e9b7a14d3e8', 'user-agent': 'NotesMobile/2.4.1', 'x-sync-id': 'sync-771' } });
handle({ method: 'POST', path: '/notes', headers: { authorization: 'Bearer tok_live_00c0ffee00c0ffee', 'user-agent': 'NotesMobile/2.4.1' }, body: { title: 'x' } });
const logged = lines.slice(before);

assert.strictEqual(logged.length, 2, `expected one log line per request, got ${logged.length}`);
const [ok, refused] = logged;
for (const want of ['GET', '/notes', '200', 'NotesMobile/2.4.1', 'sync-771']) assert.ok(ok.includes(want), `the first line lacks ${want}: ${ok}`);
for (const want of ['POST', '/notes', '401', 'NotesMobile/2.4.1']) assert.ok(refused.includes(want), `the refused request's line lacks ${want}: ${refused}`);
console.log('log: ok');
