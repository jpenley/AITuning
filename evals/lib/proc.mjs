// Running and stopping child processes so a run never hangs: output is capped, a timeout kills the whole
// process tree, and a child that exits while a descendant still holds its pipes is settled after a grace period.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { capture } from './output.mjs';

export const TASKKILL_TIMEOUT_MS = 10_000;
export const MAX_OUT_BYTES = 32 * 1024 * 1024;
export const MAX_ERR_BYTES = 4 * 1024 * 1024;
export const GRACE_MS = 5000;

function childEnvironment(env, prefixes) {
  if (!Array.isArray(prefixes) || prefixes.some(p => typeof p !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p))) {
    throw new Error('Environment prefixes must be literal nonempty variable-name prefixes.');
  }
  const out = { ...process.env };
  for (const key of Object.keys(out)) if (prefixes.some(p => key.toUpperCase().startsWith(p.toUpperCase()))) delete out[key];
  for (const [key, value] of Object.entries(env ?? {})) {
    if (process.platform === 'win32') for (const old of Object.keys(out)) if (old.toUpperCase() === key.toUpperCase()) delete out[old];
    if (value == null) delete out[key];
    else out[key] = value;
  }
  return out;
}

// Optional evidence is created before launch. An existing directory is never reused.
// Environment values are deliberately absent; disk output has its own explicit byte cap.
function durableReceipt(cmd, cwd, directory, limit) {
  if (!directory) return null;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('maxLogBytes must be a positive integer');
  const root = resolve(directory), path = join(root, 'receipt.json'), temporary = join(root, 'receipt.tmp');
  mkdirSync(dirname(root), { recursive: true });
  mkdirSync(root);
  const stream = name => ({ path: join(root, `${name}.log`), bytes: 0, savedBytes: 0, cutBytes: 0 });
  const record = { version: 1, state: 'starting', command: [...cmd], cwd: resolve(cwd ?? process.cwd()), pid: null,
    startedAt: new Date().toISOString(), completedAt: null, code: null, stdout: stream('stdout'), stderr: stream('stderr') };
  for (const key of ['stdout', 'stderr']) writeFileSync(record[key].path, '', { flag: 'wx', mode: 0o600 });
  const save = () => { writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 }); renameSync(temporary, path); };
  save();
  return {
    started(pid) { record.state = 'running'; record.pid = pid; save(); },
    push(key, chunk) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), target = record[key];
      target.bytes += buf.length;
      const take = buf.subarray(0, Math.max(0, limit - target.savedBytes));
      if (take.length) appendFileSync(target.path, take);
      target.savedBytes += take.length;
      target.cutBytes = target.bytes - target.savedBytes;
    },
    finish(result, error) {
      record.state = result.timedOut ? 'timed-out' : error ? (record.pid ? 'failed' : 'failed-to-start') : 'completed';
      record.code = result.code; record.completedAt = new Date().toISOString();
      if (error) record.error = error;
      save();
    },
  };
}

// taskkill from the Windows system folder, so a taskkill earlier on PATH isn't run instead.
export function taskkillPath(env = process.env) {
  const root = env.SystemRoot ?? env.SYSTEMROOT ?? env.windir;
  const p = root ? join(root, 'System32', 'taskkill.exe') : null;
  return p && existsSync(p) ? p : 'taskkill';
}

function treePowerShellPath() {
  return [
    join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'),
    join(process.env.ProgramFiles ?? 'C:/Program Files', 'PowerShell/7/pwsh.exe'),
  ].find(existsSync) ?? null;
}

const TREE_HELPER = fileURLToPath(new URL('./windows-process-tree.ps1', import.meta.url));

// Stop a child and, on Windows, its descendants. Native ownership/permission refusals are final.
// An unavailable helper uses bounded legacy fallback. An exited child isn't signalled (its PID may be reused).
// Returns { ok, how, why? }; never throws.
export function stopTree(child, { platform = process.platform, spawnSyncImpl = spawnSync, timeoutMs = TASKKILL_TIMEOUT_MS, taskkill = taskkillPath(), powershell = treePowerShellPath() } = {}) {
  if (child.exitCode != null || child.signalCode != null) return { ok: true, how: 'already exited' };
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || child.pid === process.pid) return { ok: false, how: 'refused', why: 'Refused an invalid or caller PID' };
  let why = null;
  if (platform === 'win32') {
    const deadline = performance.now() + timeoutMs;
    let helperTimedOut = false;
    if (powershell) {
      const r = spawnSyncImpl(powershell, ['-NoProfile', '-NonInteractive', '-File', TREE_HELPER,
        '-RootPid', String(child.pid), '-CallerPid', String(process.pid), '-WaitMs', String(timeoutMs)],
      { stdio: 'pipe', encoding: 'utf8', maxBuffer: 64 * 1024, timeout: timeoutMs, killSignal: 'SIGKILL', windowsHide: true });
      if (!r.error && r.status === 0) return { ok: true, how: 'native-tree' };
      why = `native tree cleanup: ${r.error?.code ?? `exit ${r.status}`}${r.stderr ? `: ${String(r.stderr).slice(0, 2000).trim()}` : ''}`;
      // An explicit permission/ownership refusal is final; another terminator must not bypass it.
      if (r.status === 1 || ['EACCES', 'EPERM'].includes(r.error?.code)) return { ok: false, how: 'native-tree', why };
      helperTimedOut = r.error?.code === 'ETIMEDOUT';
    }
    const remaining = helperTimedOut ? 0 : Math.ceil(deadline - performance.now());
    if (remaining > 0) {
      const r = spawnSyncImpl(taskkill, ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: remaining, killSignal: 'SIGKILL', windowsHide: true });
      if (!r.error && r.status === 0) return { ok: true, how: 'taskkill' };
      why = [why, r.error ? `taskkill: ${r.error.code ?? r.error.message}` : `taskkill exited ${r.status}`].filter(Boolean).join('; ');
    }
  }
  try {
    const ok = child.kill(platform === 'win32' ? 'SIGKILL' : 'SIGTERM');
    return { ok, how: 'kill', ...(why ? { why } : {}) };
  } catch (e) {
    return { ok: false, how: 'kill', why: [why, e.message].filter(Boolean).join('; ') };
  }
}

// Resolves { code, out, err, timedOut, outParts, outCut, errCut }. out/err are capped (head and tail kept);
// outParts is [head, tail] when stdout was cut, else null.
export function runProcess(cmd, { cwd, stdin, env, clearEnvPrefixes = [], receiptDir, maxLogBytes = MAX_OUT_BYTES,
  timeout, maxOut = MAX_OUT_BYTES, maxErr = MAX_ERR_BYTES, graceMs = GRACE_MS, stop = stopTree }) {
  return new Promise((res) => {
    const environment = childEnvironment(env, clearEnvPrefixes);
    const receipt = durableReceipt(cmd, cwd, receiptDir, maxLogBytes);
    const out = capture(maxOut);
    const err = capture(maxErr);
    let spawnError = '';
    let timedOut = false;
    let done = false;
    let grace = null;
    let p;
    const end = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(grace);
      p.stdout?.destroy();
      p.stderr?.destroy();
      const o = out.result();
      const e = err.result();
      const result = { code, out: o.text, err: e.text + spawnError, timedOut, outParts: o.parts, outCut: o.cutBytes, errCut: e.cutBytes };
      try { receipt?.finish(result, spawnError); }
      catch (error) { result.code = -1; result.err += `\nCannot persist execution receipt: ${error.message}`; }
      res(result);
    };
    p = spawn(cmd[0], cmd.slice(1), { cwd, env: environment, windowsHide: true, shell: false });
    const timer = setTimeout(() => {
      timedOut = true;
      const stopped = stop(p);
      if (stopped?.ok === false) spawnError += `Process cleanup failed: ${stopped.why ?? stopped.how}`;
      grace ??= setTimeout(() => end(p.exitCode ?? null), graceMs);
    }, timeout);
    const persist = action => {
      try { action(); }
      catch (error) { spawnError += `Cannot persist execution evidence: ${error.message}`; stop(p); end(-1); }
    };
    p.on('spawn', () => persist(() => receipt?.started(p.pid)));
    p.stdout.on('data', (d) => { out.push(d); persist(() => receipt?.push('stdout', d)); });
    p.stderr.on('data', (d) => { err.push(d); persist(() => receipt?.push('stderr', d)); });
    p.on('error', (e) => { spawnError += String(e); end(-1); });
    // A descendant can keep the pipes open after the child exits; don't wait for it forever.
    p.on('exit', (code) => { grace ??= setTimeout(() => end(code), graceMs); });
    p.on('close', (code) => end(code));
    p.stdin.on('error', () => {}); // the child may exit without reading stdin; its exit code reports the outcome
    p.stdin.end(stdin ?? '');
  });
}
