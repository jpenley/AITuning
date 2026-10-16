// NT-2: list() is cached per user. A repeated call doesn't scan the store; a change drops only the
// cached lists it affects; and every change reaches everyone it affects (the owner and the users the
// note is shared with).
const assert = require('assert');
const { store, notes, ids, rows, users } = require('./app.cjs');

const [ann, bob, cy] = users('ann', 'bob', 'cy');
const a1 = notes.create(ann, { title: 'A1', tags: ['x'] });
const b1 = notes.create(bob, { title: 'B1' });
notes.share(ann, a1.id, 'bob');
for (const u of [ann, bob, cy]) notes.list(u);

let scans = store.stats.scans;
for (const u of [ann, bob, cy]) notes.list(u);
assert.strictEqual(store.stats.scans, scans, 'list() scanned the store again with nothing changed');

notes.update(bob, b1.id, { title: 'B1 renamed' });
scans = store.stats.scans;
notes.list(ann);
notes.list(cy);
assert.strictEqual(store.stats.scans, scans, "a change to bob's private note dropped ann's and cy's cached lists");
assert.deepStrictEqual(notes.list(bob).map((n) => n.title), ['A1', 'B1 renamed']);

notes.update(ann, a1.id, { title: 'A1 renamed', tags: ['x', 'y'] });
assert.deepStrictEqual(rows(notes.list(ann)), [{ id: a1.id, title: 'A1 renamed', tags: ['x', 'y'] }]);
assert.deepStrictEqual(
  rows(notes.list(bob)).find((n) => n.id === a1.id),
  { id: a1.id, title: 'A1 renamed', tags: ['x', 'y'] },
  "an edit to a shared note didn't reach the cached list of the user it's shared with",
);

const a2 = notes.create(ann, { title: 'A2' });
assert.deepStrictEqual(ids(notes.list(ann)), [a1.id, a2.id], "a new note didn't reach its owner's cached list");
notes.share(ann, a2.id, 'cy');
assert.deepStrictEqual(ids(notes.list(cy)), [a2.id], "a share didn't reach the new reader's cached list");
console.log('cache: ok');
