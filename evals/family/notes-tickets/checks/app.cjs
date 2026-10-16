// Loads the agent's app from the workspace (each check runs with the workspace as its cwd), plus the
// helpers the checks share. Every check runs in its own process, so the store starts empty.
const assert = require('assert');
const { join } = require('path');

const load = (name) => require(join(process.cwd(), 'src', name));
const store = load('store.js');
const notes = load('notes.js');

const ids = (entries) => entries.map((n) => n.id);
const rows = (entries) => entries.map(({ id, title, tags }) => ({ id, title, tags }));

function need(...names) {
  for (const n of names) assert.strictEqual(typeof notes[n], 'function', `${n}() is missing from src/notes.js`);
}

// A refusal is any throw; the checks then look at the state to make sure nothing changed.
function refused(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function users(...names) {
  store.reset();
  return names.map((n) => store.addUser(n, `tok-${n}`));
}

module.exports = { load, store, notes, ids, rows, need, refused, users };
