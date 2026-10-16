// Shared by the checks: run the workspace's test file under node:test with a pinned export time and
// return each leaf test's result. Runs from the session's workspace (the grader's cwd).
const { spawnSync } = require('node:child_process');
const { cpSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const TEST_FILE = join('test', 'export.test.js');
const REPORTER = pathToFileURL(join(__dirname, 'reporter.mjs')).href;

const isDedupe = (name) => /dedup|duplicate/i.test(name);

function runTests({ cwd = process.cwd(), jobMs, timeoutMs = 20_000 } = {}) {
  const env = { ...process.env };
  if (jobMs === undefined) delete env.EXPORT_JOB_MS;
  else env.EXPORT_JOB_MS = String(jobMs);
  const started = Date.now();
  const r = spawnSync(process.execPath, ['--test', '--test-isolation=none', '--test-force-exit', `--test-timeout=${timeoutMs}`, `--test-reporter=${REPORTER}`, '--test-reporter-destination=stdout', TEST_FILE], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: timeoutMs + 5_000,
    windowsHide: true,
  });
  const events = (r.stdout || '').split(/\r?\n/).filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
  const tests = events.filter((e) => e.kind === 'test' && !e.skip && !/^test\/|\.test\.js$/.test(e.name));
  return { code: r.status, wallMs: Date.now() - started, tests, stderr: r.stderr || '' };
}

// A copy of the workspace with src/exports.js replaced, for running the tests against a planted fault.
function withMutant(mutantPath, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tdd-flaky-mutant-'));
  try {
    cpSync(process.cwd(), dir, { recursive: true, filter: (src) => !/[\\/]\.git$|[\\/]node_modules$/.test(src) });
    cpSync(mutantPath, join(dir, 'src', 'exports.js'));
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fail = (why) => {
  console.error(why);
  process.exit(1);
};

module.exports = { runTests, withMutant, isDedupe, fail };
