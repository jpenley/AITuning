// NT-1: archive(user, id) hides a note from list() and search() for everyone who could see it, get()
// still returns it, and only the owner may archive (README). Lists are read first, so a list cache
// from NT-2 is warm when the archive happens.
const assert = require('assert');
const { notes, ids, need, refused, users } = require('./app.cjs');

need('archive');
const [ann, bob] = users('ann', 'bob');
const keep = notes.create(ann, { title: 'Groceries', body: 'milk eggs' });
const old = notes.create(ann, { title: 'Old milk plan', body: 'milk run on friday' });
notes.share(ann, old.id, 'bob');
assert.deepStrictEqual(ids(notes.list(ann)), [keep.id, old.id]);
assert.deepStrictEqual(ids(notes.list(bob)), [old.id]);

assert.ok(refused(() => notes.archive(bob, old.id)), 'bob archived a note he only has read access to');
assert.deepStrictEqual(ids(notes.search(ann, 'milk')), [keep.id, old.id], 'a refused archive still hid the note');

notes.archive(ann, old.id);
assert.deepStrictEqual(ids(notes.list(ann)), [keep.id], "archived note still in the owner's list()");
assert.deepStrictEqual(ids(notes.list(bob)), [], 'archived note still in list() for the user it is shared with');
assert.deepStrictEqual(ids(notes.search(ann, 'milk')), [keep.id], 'archived note still in search()');
assert.deepStrictEqual(ids(notes.search(bob, 'milk')), [], 'archived note still in search() for the user it is shared with');
assert.strictEqual(notes.get(ann, old.id).title, 'Old milk plan', 'get() lost the archived note');
console.log('archive: ok');
