const fs = require('node:fs');

// Synchronous. Appends the message to outbox.log, where the mail relay picks it up. Throws on a bad address.
function send(to, subject, body) {
  if (!to || !to.includes('@')) throw new Error(`bad address: ${to}`);
  fs.appendFileSync('outbox.log', JSON.stringify({ to, subject, body, at: new Date().toISOString() }) + '\n');
}

module.exports = { send };
