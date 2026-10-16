// The application log. Lines are kept in `lines` (tests read them there) and also written to stderr
// when NOTES_LOG is set.
const lines = [];

function log(line) {
  lines.push(String(line));
  if (process.env.NOTES_LOG) process.stderr.write(`${line}\n`);
}

module.exports = { log, lines };
