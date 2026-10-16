const assert = require('assert');
const store = require('../src/store');
const notes = require('../src/notes');
const { handle } = require('../src/http');
const { lines } = require('../src/log');

store.reset();
const ann = store.addUser('ann', 'tok-ann');

// NT-1
const a = notes.create(ann, { title: 'Groceries', body: 'milk' });
const b = notes.create(ann, { title: 'Old plan', body: 'milk run' });
notes.archive(ann, b.id);
assert.deepStrictEqual(notes.list(ann).map((n) => n.id), [a.id]);
assert.deepStrictEqual(notes.search(ann, 'milk').map((n) => n.id), [a.id]);

// NT-2
const scans = store.stats.scans;
notes.list(ann);
assert.strictEqual(store.stats.scans, scans);

// NT-3
handle({ method: 'GET', path: '/notes', headers: { authorization: 'Bearer tok-ann' } });
assert.match(lines.at(-1), /GET \/notes 200/);

// NT-4
const c = notes.create(ann, { title: 'Trip', body: 'Book flights', tags: ['travel'] });
const d = notes.create(ann, { title: 'Ideas', body: 'Visit Kyoto', tags: ['ideas'] });
assert.strictEqual(notes.merge(ann, c.id, d.id).body, 'Book flights\n\nVisit Kyoto');

// NT-5
notes.restore(ann, b.id);
assert.ok(notes.list(ann).some((n) => n.id === b.id));

console.log('tickets.test.js: ok');
