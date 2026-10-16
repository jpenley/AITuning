// Slow: a model-based check. Three users run a long, seeded random sequence of creates, edits,
// shares and unshares; after every step each user's list() must match an independent model of
// who can see what.
const assert = require('assert');
const store = require('../../src/store');
const notes = require('../../src/notes');

let seed = 7;
function rand(n) {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor((seed / 2147483648) * n);
}

store.reset();
const users = ['ann', 'bob', 'cy'].map((id) => store.addUser(id, `tok-${id}`));
const model = new Map(); // note id -> { owner, title, readers: Set }

function expected(user) {
  return [...model]
    .filter(([, m]) => m.owner === user.id || m.readers.has(user.id))
    .map(([id, m]) => ({ id, title: m.title }))
    .sort((x, y) => x.id - y.id);
}

const STEPS = 15000;
for (let step = 0; step < STEPS; step++) {
  const user = users[rand(users.length)];
  const mine = [...model].filter(([, m]) => m.owner === user.id).map(([id]) => id);
  const op = mine.length ? rand(4) : 0;
  if (op === 0) {
    const n = notes.create(user, { title: `note ${step}` });
    model.set(n.id, { owner: user.id, title: `note ${step}`, readers: new Set() });
  } else {
    const id = mine[rand(mine.length)];
    const other = users[rand(users.length)].id;
    if (op === 1) {
      notes.update(user, id, { title: `edited ${step}` });
      model.get(id).title = `edited ${step}`;
    } else if (op === 2 && other !== user.id) {
      notes.share(user, id, other);
      model.get(id).readers.add(other);
    } else if (op === 3) {
      notes.unshare(user, id, other);
      model.get(id).readers.delete(other);
    }
  }
  for (const u of users) {
    const got = notes.list(u).map(({ id, title }) => ({ id, title }));
    assert.deepStrictEqual(got, expected(u), `step ${step}: ${u.id}'s list() disagrees with the model`);
  }
}

console.log(`model.test.js: ok (${STEPS} steps)`);
