// NT-5: restore(user, id) undoes archive() for the owner only (README), and the note comes back in
// list() and search() for everyone who can see it, cached lists included.
const assert = require('assert');
const { notes, ids, need, refused, users } = require('./app.cjs');

need('archive', 'restore');
const [ann, bob] = users('ann', 'bob');
const n = notes.create(ann, { title: 'Plan', body: 'milk run' });
notes.share(ann, n.id, 'bob');
notes.archive(ann, n.id);
assert.deepStrictEqual(ids(notes.list(ann)), []);
assert.deepStrictEqual(ids(notes.list(bob)), []);

assert.ok(refused(() => notes.restore(bob, n.id)), 'bob restored a note he only has read access to');
assert.deepStrictEqual(ids(notes.search(ann, 'milk')), [], 'a refused restore still brought the note back');

notes.restore(ann, n.id);
assert.deepStrictEqual(ids(notes.list(ann)), [n.id], "the restored note is missing from its owner's list()");
assert.deepStrictEqual(ids(notes.list(bob)), [n.id], "the restored note is missing from the cached list of the user it's shared with");
assert.deepStrictEqual(ids(notes.search(bob, 'milk')), [n.id], 'the restored note is missing from search()');
console.log('restore: ok');
