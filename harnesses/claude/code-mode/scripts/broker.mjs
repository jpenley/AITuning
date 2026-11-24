import { mkdtempSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { runGuest } from './runtime.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const atomic = (path, value) => { writeFileSync(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 }); renameSync(`${path}.tmp`, path); };
async function stdin() {
  let value = '';
  let bytes = 0;
  process.stdin.setEncoding('utf8');
  for await (const part of process.stdin) {
    bytes += Buffer.byteLength(part, 'utf8');
    value += part;
    if (bytes > 3 * 1024 * 1024) throw new Error('protocol input exceeds 3 MiB');
  }
  return JSON.parse(value);
}
function mailbox(path, nonce) {
  const root = realpathSync(tmpdir());
  const dir = realpathSync(path);
  if (dirname(dir) !== root || !basename(dir).startsWith('aituning-codemode-') || lstatSync(path).isSymbolicLink()) throw new Error('invalid mailbox path');
  const marker = JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8'));
  if (marker.nonce !== nonce || marker.expires < Date.now()) throw new Error('invalid or expired mailbox owner');
  return dir;
}
export async function command(action, path, nonce) {
  if (action === 'init') {
    const dir = mkdtempSync(join(realpathSync(tmpdir()), 'aituning-codemode-'));
    const token = randomUUID();
    atomic(join(dir, 'owner.json'), { nonce: token, expires: Date.now() + 120000 });
    return { dir, nonce: token };
  }
  const dir = mailbox(path, nonce);
  if (action === 'cleanup') { rmSync(dir, { recursive: true }); return { cleaned: true }; }
  if (action === 'cancel') { atomic(join(dir, 'cancel.json'), { cancelled: true }); return { cancelled: true }; }
  if (action === 'reply') {
    const value = await stdin();
    if (!Number.isInteger(value.id) || value.id < 1 || value.id > 32 || !existsSync(join(dir, `request-${value.id}.json`))) throw new Error('invalid reply id');
    const dest = join(dir, `reply-${value.id}.json`);
    if (existsSync(dest)) throw new Error('reply already exists; refusing duplicate');
    atomic(dest, value);
    writeFileSync(join(dir, `reply-${value.id}.ready`), 'ready', { mode: 0o600 });
    return { replied: value.id };
  }
  if (action === 'next') {
    const until = Date.now() + 1000;
    do {
      if (existsSync(join(dir, 'done.json'))) return { done: JSON.parse(readFileSync(join(dir, 'done.json'), 'utf8')) };
      const files = readdirSync(dir).filter(name => /^request-\d+\.json$/.test(name)).sort((a, b) => Number(a.slice(8, -5)) - Number(b.slice(8, -5)));
      const requests = files.map(name => JSON.parse(readFileSync(join(dir, name), 'utf8'))).filter(r => !existsSync(join(dir, `reply-${r.id}.ready`)));
      if (requests.length) return { requests };
      await pause(15);
    } while (Date.now() < until);
    return { waiting: true };
  }
  if (action !== 'run') throw new Error('unknown broker action');
  const input = await stdin();
  const deadline = Date.now() + 60000;
  const watchdog = setTimeout(() => { atomic(join(dir, 'done.json'), { ok: false, error: 'broker deadline exceeded; effects are not rolled back' }); process.exit(1); }, 61000);
  const result = await runGuest({ code: input.code, catalog: input.catalog, timeoutMs: 60000, callTool: async request => {
    if (existsSync(join(dir, 'cancel.json'))) throw new Error('cancelled');
    atomic(join(dir, `request-${request.id}.json`), request);
    const reply = join(dir, `reply-${request.id}.json`);
    while (!existsSync(join(dir, `reply-${request.id}.ready`))) {
      if (Date.now() > deadline || existsSync(join(dir, 'cancel.json'))) throw new Error('cancelled or expired; effects are not rolled back');
      await pause(15);
    }
    if (lstatSync(reply).isSymbolicLink() || lstatSync(reply).size > 3 * 1024 * 1024) throw new Error('invalid or oversized reply');
    const envelope = JSON.parse(readFileSync(reply, 'utf8'));
    if (envelope.id !== request.id) throw new Error('invalid reply id');
    return envelope.value;
  } });
  atomic(join(dir, 'done.json'), result);
  clearTimeout(watchdog);
  return { completed: true };
}
if (process.argv[2]) {
  command(...process.argv.slice(2)).then(value => process.stdout.write(JSON.stringify(value) + '\n')).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
