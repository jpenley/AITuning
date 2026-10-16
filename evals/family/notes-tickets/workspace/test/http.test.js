const assert = require('assert');
const store = require('../src/store');
const { handle } = require('../src/http');

store.reset();
store.addUser('ann', 'tok-ann');
store.addUser('bob', 'tok-bob');
const as = (token) => ({ authorization: `Bearer ${token}` });

assert.strictEqual(handle({ method: 'GET', path: '/notes', headers: {} }).status, 401);
assert.strictEqual(handle({ method: 'GET', path: '/notes', headers: as('nope') }).status, 401);

const created = handle({ method: 'POST', path: '/notes', headers: as('tok-ann'), body: { title: 'Plan' } });
assert.strictEqual(created.status, 200);
const id = created.body.id;

assert.deepStrictEqual(handle({ method: 'GET', path: '/notes', headers: as('tok-ann') }).body.map((n) => n.id), [id]);
assert.strictEqual(handle({ method: 'GET', path: `/notes/${id}`, headers: as('tok-bob') }).status, 404);

assert.strictEqual(handle({ method: 'POST', path: `/notes/${id}/share`, headers: as('tok-ann'), body: { user: 'bob' } }).status, 200);
assert.strictEqual(handle({ method: 'GET', path: `/notes/${id}`, headers: as('tok-bob') }).body.title, 'Plan');

console.log('http.test.js: ok');
