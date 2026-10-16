// NT-1 to NT-5. Each scenario reads the lists first, so a cached list is warm when the change lands.
const assert = require('assert');
const store = require('../src/store');
const notes = require('../src/notes');
const { handle } = require('../src/http');
const { lines } = require('../src/log');

const ids = (entries) => entries.map((n) => n.id);

function fresh(...names) {
  store.reset();
  notes.clearCache();
  return names.map((n) => store.addUser(n, `tok-${n}`));
}

// NT-1: archive hides a note from its owner and its readers; only the owner may archive.
{
  const [ann, bob] = fresh('ann', 'bob');
  const keep = notes.create(ann, { title: 'Groceries', body: 'milk' });
  const old = notes.create(ann, { title: 'Old plan', body: 'milk run' });
  notes.share(ann, old.id, 'bob');
  notes.list(ann);
  notes.list(bob);
  assert.throws(() => notes.archive(bob, old.id), notes.AccessError);
  notes.archive(ann, old.id);
  assert.deepStrictEqual(ids(notes.list(ann)), [keep.id]);
  assert.deepStrictEqual(ids(notes.list(bob)), []);
  assert.deepStrictEqual(ids(notes.search(ann, 'milk')), [keep.id]);
  assert.strictEqual(notes.get(ann, old.id).title, 'Old plan');
}

// NT-2: a repeated list() doesn't scan; a change leaves unaffected users' caches alone.
{
  const [ann, bob] = fresh('ann', 'bob');
  const a = notes.create(ann, { title: 'A' });
  notes.create(bob, { title: 'B' });
  notes.list(ann);
  notes.list(bob);
  const scans = store.stats.scans;
  notes.list(ann);
  notes.update(bob, 2, { title: 'B2' });
  notes.list(ann);
  assert.strictEqual(store.stats.scans, scans);
  notes.share(ann, a.id, 'bob');
  notes.list(bob);
  notes.update(ann, a.id, { title: 'A2' });
  assert.strictEqual(notes.list(bob).find((n) => n.id === a.id).title, 'A2');
}

// NT-2 abuse case: an unshare revokes access even when the reader's list is cached.
{
  const [ann, bob, cy] = fresh('ann', 'bob', 'cy');
  const secret = notes.create(ann, { title: 'Salary review' });
  notes.share(ann, secret.id, 'bob');
  assert.deepStrictEqual(ids(notes.list(bob)), [secret.id]);
  assert.deepStrictEqual(ids(notes.list(cy)), []);
  notes.unshare(ann, secret.id, 'bob');
  assert.deepStrictEqual(ids(notes.list(bob)), []);
}

// NT-3: one line per request with method, path, status and headers; abuse case: no bearer token.
{
  fresh('ann');
  const before = lines.length;
  handle({ method: 'GET', path: '/notes', headers: { authorization: 'Bearer tok-ann', 'user-agent': 'NotesMobile/2' } });
  handle({ method: 'GET', path: '/notes', headers: { authorization: 'Bearer stolen-guess' } });
  const logged = lines.slice(before);
  assert.strictEqual(logged.length, 2);
  assert.match(logged[0], /GET \/notes 200 .*NotesMobile\/2/);
  assert.match(logged[1], /GET \/notes 401/);
  assert.ok(!logged.join('\n').includes('tok-ann'));
  assert.ok(!logged.join('\n').includes('stolen-guess'));
}

// NT-4: merge appends, adds missing tags, archives the source, and reaches readers' cached lists.
{
  const [ann, bob] = fresh('ann', 'bob');
  const target = notes.create(ann, { title: 'Trip', body: 'Book flights', tags: ['travel'] });
  const source = notes.create(ann, { title: 'Ideas', body: 'Visit Kyoto', tags: ['travel', 'ideas'] });
  notes.share(ann, target.id, 'bob');
  notes.list(bob);
  const out = notes.merge(ann, target.id, source.id);
  assert.strictEqual(out.body, 'Book flights\n\nVisit Kyoto');
  assert.deepStrictEqual(out.tags, ['travel', 'ideas']);
  assert.deepStrictEqual(ids(notes.list(ann)), [target.id]);
  assert.deepStrictEqual(notes.list(bob)[0].tags, ['travel', 'ideas']);
}

// NT-4 abuse case: merge refuses notes the user doesn't own, even ones shared with them.
{
  const [ann, bob] = fresh('ann', 'bob');
  const shared = notes.create(ann, { title: 'Shared', body: 'ann text' });
  notes.share(ann, shared.id, 'bob');
  const hidden = notes.create(ann, { title: 'Hidden', body: 'secret' });
  const mine = notes.create(bob, { title: 'Mine', body: 'bob text' });
  assert.throws(() => notes.merge(bob, mine.id, shared.id), notes.AccessError);
  assert.throws(() => notes.merge(bob, mine.id, hidden.id), notes.AccessError);
  assert.throws(() => notes.merge(bob, shared.id, mine.id), notes.AccessError);
  assert.strictEqual(notes.get(bob, mine.id).body, 'bob text');
  assert.deepStrictEqual(ids(notes.list(ann)), [shared.id, hidden.id]);
}

// NT-5: restore brings a note back for its readers too; only the owner may restore.
{
  const [ann, bob] = fresh('ann', 'bob');
  const n = notes.create(ann, { title: 'Plan', body: 'milk' });
  notes.share(ann, n.id, 'bob');
  notes.archive(ann, n.id);
  notes.list(bob);
  assert.throws(() => notes.restore(bob, n.id), notes.AccessError);
  notes.restore(ann, n.id);
  assert.deepStrictEqual(ids(notes.list(bob)), [n.id]);
  assert.deepStrictEqual(ids(notes.search(ann, 'milk')), [n.id]);
}

console.log('tickets.test.js: ok');
