// NT-4, requirement stated once in the README: only the owner may merge or archive a note, so merge()
// refuses a source or a target the user doesn't own, including one merely shared with them, and a
// refused merge changes nothing.
const assert = require('assert');
const { notes, ids, need, refused, users } = require('./app.cjs');

need('merge');
const [ann, bob] = users('ann', 'bob');
const hidden = notes.create(ann, { title: 'Ann private', body: 'the secret plan' });
const shared = notes.create(ann, { title: 'Ann shared', body: 'shared text' });
notes.share(ann, shared.id, 'bob');
const mine = notes.create(bob, { title: 'Bob own', body: 'bob body' });

assert.ok(refused(() => notes.merge(bob, mine.id, hidden.id)), "bob merged in a note he can't see");
assert.ok(refused(() => notes.merge(bob, mine.id, shared.id)), 'bob merged, and so archived, a note that is only shared with him');
assert.ok(refused(() => notes.merge(bob, shared.id, mine.id)), "bob merged into a note he doesn't own");

assert.strictEqual(notes.get(bob, mine.id).body, 'bob body', "a refused merge changed bob's note");
assert.strictEqual(notes.get(ann, shared.id).body, 'shared text', "a refused merge changed ann's note");
assert.deepStrictEqual(ids(notes.search(ann, 'ann')), [hidden.id, shared.id], "a refused merge archived ann's note");
assert.deepStrictEqual(ids(notes.search(bob, 'bob own')), [mine.id], "a refused merge archived bob's note");
console.log('merge-access: ok');
