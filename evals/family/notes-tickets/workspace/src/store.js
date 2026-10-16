// In-memory storage for users and notes. all() is a full pass over every note, the slow part on
// big accounts, so it counts its calls in stats.scans.
let users = new Map();
let notes = new Map();
let nextId = 1;
const stats = { scans: 0 };

function reset() {
  users = new Map();
  notes = new Map();
  nextId = 1;
  stats.scans = 0;
}

function addUser(id, token) {
  const user = { id, token };
  users.set(id, user);
  return user;
}

function userByToken(token) {
  for (const user of users.values()) if (user.token === token) return user;
  return null;
}

function insert(fields) {
  const note = { id: nextId++, ...fields };
  notes.set(note.id, note);
  return note;
}

function find(id) {
  return notes.get(id) ?? null;
}

function all() {
  stats.scans++;
  return [...notes.values()];
}

module.exports = { reset, addUser, userByToken, insert, find, all, stats };
