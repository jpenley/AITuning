// The project's own tests, as shipped, pass against the final code: the fast tests and the slow
// model-based check that CI runs (about 15 s). It runs the fixture's original test files over a copy
// of the workspace, so a weakened, skipped, or deleted test doesn't count.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ws = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-suite-'));
try {
  const skip = new Set(['.git', '.agents', 'node_modules', 'test']);
  fs.cpSync(ws, tmp, { recursive: true, filter: (src) => !skip.has(path.relative(ws, src).split(path.sep)[0]) });
  fs.cpSync(path.join(__dirname, '..', 'workspace', 'test'), path.join(tmp, 'test'), { recursive: true });
  const r = spawnSync(process.execPath, [path.join(tmp, 'test', 'run.js'), '--all'], { cwd: tmp, stdio: 'inherit', timeout: 55_000 });
  process.exitCode = r.status === 0 ? 0 : 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
