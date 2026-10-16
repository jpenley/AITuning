// The notes service. Every function takes the acting user first; README.md has the access rules.
const store = require('./store');

class AccessError extends Error {
  name = 'AccessError';
}

// list() results by user id. A change drops the cached list of everyone who could see the note
// before or after it: its owner and its readers. Nobody else's is touched.
const cached = new Map();

function forget(note) {
  cached.delete(note.owner);
  for (const id of note.sharedWith) cached.delete(id);
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
  const note = store.insert({ owner: user.id, title, body, tags: [...tags], sharedWith: [], archived: false });
  forget(note);
  return note;
}

function get(user, id) {
  return readable(user, id);
}

function update(user, id, { title, body, tags }) {
  const note = owned(user, id);
  if (title !== undefined) note.title = title;
  if (body !== undefined) note.body = body;
  if (tags !== undefined) note.tags = [...tags];
  forget(note);
  return note;
}

function share(user, id, otherId) {
  const note = owned(user, id);
  if (!note.sharedWith.includes(otherId)) note.sharedWith.push(otherId);
  forget(note);
  return note;
}

function unshare(user, id, otherId) {
  const note = owned(user, id);
  // Forget before removing the reader: their cached list still holds the note.
  forget(note);
  note.sharedWith = note.sharedWith.filter((u) => u !== otherId);
  return note;
}

function setArchived(user, id, archived) {
  const note = owned(user, id);
  note.archived = archived;
  forget(note);
  return note;
}

function archive(user, id) {
  return setArchived(user, id, true);
}

function restore(user, id) {
  return setArchived(user, id, false);
}

// Merging archives the source, so the user must own both notes.
function merge(user, targetId, sourceId) {
  const target = owned(user, targetId);
  const source = owned(user, sourceId);
  if (target === source) throw new Error('a note cannot be merged into itself');
  target.body = `${target.body}\n\n${source.body}`;
  for (const tag of source.tags) if (!target.tags.includes(tag)) target.tags.push(tag);
  source.archived = true;
  forget(target);
  forget(source);
  return target;
}

function shown(user, note) {
  return canSee(user, note) && !note.archived;
}

// The notes a user can see, oldest first. Callers get copies, so they can't change the cache.
function list(user) {
  if (!cached.has(user.id)) {
    cached.set(
      user.id,
      store
        .all()
        .filter((n) => shown(user, n))
        .map((n) => ({ id: n.id, title: n.title, tags: [...n.tags] })),
    );
  }
  return cached.get(user.id).map((e) => ({ ...e, tags: [...e.tags] }));
}

function search(user, query) {
  const q = query.toLowerCase();
  return store
    .all()
    .filter((n) => shown(user, n))
    .filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
    .map((n) => ({ id: n.id, title: n.title }));
}

// Drops every cached list; store.reset() leaves this module's cache alone.
function clearCache() {
  cached.clear();
}

module.exports = { AccessError, create, get, update, share, unshare, archive, restore, merge, list, search, clearCache };
