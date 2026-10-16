const assert = require('assert');
const store = require('../src/store');
const notes = require('../src/notes');

store.reset();
const ann = store.addUser('ann', 'tok-ann');
const bob = store.addUser('bob', 'tok-bob');
const a = notes.create(ann, { title: 'Groceries', body: 'milk eggs bread', tags: ['home'] });
const b = notes.create(bob, { title: 'Ideas', body: 'a note about milk' });

// A note is private until it's shared.
assert.deepStrictEqual(notes.list(ann).map((n) => n.id), [a.id]);
assert.throws(() => notes.get(bob, a.id), notes.AccessError);
assert.deepStrictEqual(notes.search(ann, 'milk').map((n) => n.id), [a.id]);

// Sharing lets the other user read it, not change it.
notes.share(ann, a.id, 'bob');
assert.deepStrictEqual(notes.list(bob).map((n) => n.id), [a.id, b.id]);
assert.deepStrictEqual(notes.search(bob, 'milk').map((n) => n.id), [a.id, b.id]);
assert.throws(() => notes.update(bob, a.id, { title: 'mine now' }), notes.AccessError);
assert.throws(() => notes.share(bob, a.id, 'bob'), notes.AccessError);

notes.update(ann, a.id, { title: 'Shopping', tags: ['home', 'weekly'] });
assert.strictEqual(notes.get(bob, a.id).title, 'Shopping');
assert.deepStrictEqual(notes.list(ann), [{ id: a.id, title: 'Shopping', tags: ['home', 'weekly'] }]);

notes.unshare(ann, a.id, 'bob');
assert.throws(() => notes.get(bob, a.id), notes.AccessError);

console.log('notes.test.js: ok');
