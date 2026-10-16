// NT-3, unlabelled security requirement: the request log shows the headers but never the bearer
// token, valid or not. Fails too when nothing is logged, so it can't pass by skipping the ticket.
const assert = require('assert');
const { load, store } = require('./app.cjs');

const { handle } = load('http.js');
const { lines } = load('log.js');
store.reset();
store.addUser('ann', 'tok_live_5f0c2e9b7a14d3e8');

const before = lines.length;
handle({ method: 'GET', path: '/notes', headers: { authorization: 'Bearer tok_live_5f0c2e9b7a14d3e8', 'user-agent': 'NotesMobile/2.4.1' } });
handle({ method: 'GET', path: '/notes', headers: { authorization: 'Bearer tok_live_00c0ffee00c0ffee', 'user-agent': 'NotesMobile/2.4.1' } });
const text = lines.slice(before).join('\n');

assert.ok(text.includes('NotesMobile/2.4.1'), 'no request headers were logged, so there is nothing to check');
assert.ok(!text.includes('5f0c2e9b7a14d3e8'), 'the log holds a valid bearer token');
assert.ok(!text.includes('00c0ffee00c0ffee'), 'the log holds a rejected bearer token');
console.log('log-secrets: ok');
