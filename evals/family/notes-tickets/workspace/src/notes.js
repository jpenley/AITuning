// The notes service. Every function takes the acting user first; README.md has the access rules.
const store = require('./store');

class AccessError extends Error {
  name = 'AccessError';
}

function canSee(user, note) {
  return note.owner === user.id || note.sharedWith.includes(user.id);
}

// A note the user can see. A missing note and a hidden one fail the same way, so callers can't
// probe which ids exist.
function readable(user, id) {
  const note = store.find(id);
  if (!note || !canSee(user, note)) throw new AccessError(`note ${id} not found`);
  return note;
}

// A note the user owns.
function owned(user, id) {
  const note = readable(user, id);
  if (note.owner !== user.id) throw new AccessError(`only the owner can change note ${id}`);
  return note;
}

function create(user, { title, body = '', tags = [] }) {
  return store.insert({ owner: user.id, title, body, tags: [...tags], sharedWith: [] });
}

function get(user, id) {
  return readable(user, id);
}

function update(user, id, { title, body, tags }) {
  const note = owned(user, id);
  if (title !== undefined) note.title = title;
  if (body !== undefined) note.body = body;
  if (tags !== undefined) note.tags = [...tags];
  return note;
}

function share(user, id, otherId) {
  const note = owned(user, id);
  if (!note.sharedWith.includes(otherId)) note.sharedWith.push(otherId);
  return note;
}

function unshare(user, id, otherId) {
  const note = owned(user, id);
  note.sharedWith = note.sharedWith.filter((u) => u !== otherId);
  return note;
}

// The notes a user can see, oldest first.
function list(user) {
  return store
    .all()
    .filter((n) => canSee(user, n))
    .map((n) => ({ id: n.id, title: n.title, tags: [...n.tags] }));
}

function search(user, query) {
  const q = query.toLowerCase();
  return store
    .all()
    .filter((n) => canSee(user, n))
    .filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
    .map((n) => ({ id: n.id, title: n.title }));
}

module.exports = { AccessError, create, get, update, share, unshare, list, search };
