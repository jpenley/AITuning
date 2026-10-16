// Run from the workspace: exit 0 when bench.js (the user's yardstick) is byte-identical to the original.
const fs = require('fs');
const path = require('path');
const want = fs.readFileSync(path.join(__dirname, '..', 'workspace', 'bench.js'), 'utf8');
const got = fs.existsSync('bench.js') ? fs.readFileSync('bench.js', 'utf8') : '';
if (got.replace(/\r\n/g, '\n') !== want.replace(/\r\n/g, '\n')) {
  console.error('bench.js was changed or removed');
  process.exit(1);
}
console.log('bench.js unchanged');
