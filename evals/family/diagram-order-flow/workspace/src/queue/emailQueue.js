const pending = [];

function enqueue(message) {
  pending.push(message);
}

function next() {
  return pending.shift();
}

module.exports = { enqueue, next };
