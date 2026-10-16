// NT-2, unlabelled security requirement: a cached list never outlives the access it was built from.
// After an unshare the former reader's list() (and GET /notes) no longer shows the note, and one
// user's cached list is never served to another.
const assert = require('assert');
const { load, notes, ids, users } = require('./app.cjs');

const [ann, bob, cy] = users('ann', 'bob', 'cy');
const secret = notes.create(ann, { title: 'Salary review', body: 'numbers' });
notes.share(ann, secret.id, 'bob');
assert.deepStrictEqual(ids(notes.list(bob)), [secret.id]);
assert.deepStrictEqual(ids(notes.list(cy)), [], "cy was served a list that isn't hers");

notes.unshare(ann, secret.id, 'bob');
assert.deepStrictEqual(ids(notes.list(bob)), [], 'after the unshare, the cached list still shows the note to its former reader');
const { handle } = load('http.js');
const res = handle({ method: 'GET', path: '/notes', headers: { authorization: 'Bearer tok-bob' } });
assert.deepStrictEqual(ids(res.body), [], 'after the unshare, GET /notes still shows the note to its former reader');
assert.deepStrictEqual(ids(notes.list(ann)), [secret.id]);
console.log('revoked: ok');
