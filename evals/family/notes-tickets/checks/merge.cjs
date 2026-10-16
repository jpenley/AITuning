// NT-4: merge(user, targetId, sourceId) appends the source's body after a blank line, adds the tags
// the target lacks, archives the source, and returns the target. Lists are read first, so the change
// must reach the cached lists of the target's and the source's readers too.
const assert = require('assert');
const { notes, ids, rows, need, users } = require('./app.cjs');

// Tag order isn't part of the ticket; compare tags as sets.
const sorted = (entries) => rows(entries).map((e) => ({ ...e, tags: [...e.tags].sort() }));

need('merge');
const [ann, bob, cy] = users('ann', 'bob', 'cy');
const target = notes.create(ann, { title: 'Trip', body: 'Book flights', tags: ['travel'] });
const source = notes.create(ann, { title: 'Trip ideas', body: 'Visit Kyoto', tags: ['travel', 'ideas'] });
notes.share(ann, target.id, 'bob');
notes.share(ann, source.id, 'cy');
for (const u of [ann, bob, cy]) notes.list(u);

const out = notes.merge(ann, target.id, source.id);
assert.strictEqual(out.id, target.id, 'merge() should return the target');
assert.strictEqual(out.body, 'Book flights\n\nVisit Kyoto');
assert.deepStrictEqual([...out.tags].sort(), ['ideas', 'travel']);
assert.strictEqual(notes.get(ann, target.id).body, 'Book flights\n\nVisit Kyoto');
assert.strictEqual(notes.get(ann, source.id).title, 'Trip ideas', 'the archived source should stay in the store');

const merged = [{ id: target.id, title: 'Trip', tags: ['ideas', 'travel'] }];
assert.deepStrictEqual(sorted(notes.list(ann)), merged, "the owner's list() doesn't show the merge");
assert.deepStrictEqual(sorted(notes.list(bob)), merged, "the merge didn't reach the cached list of the target's reader");
assert.deepStrictEqual(ids(notes.list(cy)), [], "the archived source still shows in its reader's cached list");
assert.deepStrictEqual(ids(notes.search(ann, 'kyoto')), [target.id]);
console.log('merge: ok');
