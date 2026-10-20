// A minimal MCP client over stdio, shared by route.mjs and the judgment-engine A/B harness (ab.mjs).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { stopTree } from './proc.mjs';
import { resolveCommand } from './cli.mjs';

// npx: on PATH (unwrapping Windows .cmd shims), or the npx-cli.js that ships beside this node.
// Returns the argv to spawn for a server command line split into words, or null when npx can't be found.
export function serverArgv(words) {
  if (words[0] !== 'npx') return words;
  const bundledNpx = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  const npx = resolveCommand('npx') ?? (existsSync(bundledNpx) ? [process.execPath, bundledNpx] : null);
  return npx ? [...npx, ...words.slice(1)] : null;
}

// A minimal MCP client: newline-delimited JSON-RPC, one request at a time. Returns { call(name, args), close() }.
export function mcpClient(argv, { env = process.env, timeoutMs = 120_000 } = {}) {
  const child = spawn(argv[0], argv.slice(1), { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let buf = '';
  let err = '';
  let nextId = 1;
  const pending = new Map();
  child.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); clearTimeout(p.timer); msg.error ? p.reject(new Error(msg.error.message ?? 'MCP error')) : p.resolve(msg.result); }
    }
  });
  child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
  const fail = (e) => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(e); } pending.clear(); };
  child.on('error', fail);
  child.on('exit', (code) => fail(new Error(`MCP server exited (${code}): ${err.trim().split('\n').pop() ?? ''}`)));
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs / 1000} s`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  let ready = null;
  const init = () => (ready ??= request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'aituning-route', version: '1' } })
    .then(() => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')));
  return {
    async call(name, args) {
      await init();
      const res = await request('tools/call', { name, arguments: args });
      const text = (res?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      if (res?.isError) throw new Error(`${name}: ${text.slice(0, 500)}`);
      try { return JSON.parse(text); } catch { throw new Error(`${name}: result is not JSON: ${text.slice(0, 200)}`); }
    },
    close() { try { child.stdin.end(); } catch { /* already closed */ } stopTree(child); },
  };
}
