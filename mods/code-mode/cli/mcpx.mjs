#!/usr/bin/env node
// mcpx: call the MCP tools of a running Claude Code session from a shell.
// Requests go through a spool directory that the code-mode mod's bridge polls,
// so every call uses the session's own connections, auth and permission checks.
import { mkdirSync, writeFileSync, readFileSync, renameSync, readdirSync, existsSync, rmSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MCPX_HOME || join(homedir(), '.claude', 'mcpx');
const FRESH_MS = 15000;
const MAX_FRAME = 250000;
const pause = ms => new Promise(done => setTimeout(done, ms));
const atomic = (path, value) => { writeFileSync(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 }); renameSync(`${path}.tmp`, path); };
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const out = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const fail = (message, code = 1) => { out({ ok: false, error: message }); process.exit(code); };

async function stdin() {
  let value = '';
  process.stdin.setEncoding('utf8');
  for await (const part of process.stdin) value += part;
  return value;
}

function sessions() {
  if (!existsSync(BASE)) return [];
  const rows = [];
  for (const name of readdirSync(BASE)) {
    const dir = join(BASE, name);
    try {
      const info = readJson(join(dir, 'session.json'));
      const beat = readJson(join(dir, 'heartbeat.json')).at;
      rows.push({ id: name, dir, cwd: info.cwd, age: Date.now() - beat });
    } catch { /* not a session directory */ }
  }
  return rows;
}

function within(cwd, root) {
  const a = resolve(cwd).toLowerCase(), b = resolve(root).toLowerCase();
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
}

function pick(wanted) {
  const live = sessions().filter(s => s.age < FRESH_MS);
  if (wanted) {
    const found = live.find(s => s.id === wanted);
    if (!found) fail(`session ${wanted} is not running (live: ${live.map(s => s.id).join(', ') || 'none'})`);
    return found;
  }
  const here = live.filter(s => within(process.cwd(), s.cwd)).sort((x, y) => y.cwd.length - x.cwd.length || x.age - y.age);
  if (here.length) return here[0];
  if (live.length === 1) return live[0];
  fail(live.length ? `${live.length} live sessions, none match ${process.cwd()}; pass --session <id>` : 'no live Claude Code session with the code-mode bridge; install the mod and restart Claude Code');
}

async function request(session, body, timeoutMs) {
  const id = randomUUID();
  atomic(join(session.dir, `req-${id}.json`), { id, ...body });
  const ready = join(session.dir, `res-${id}.ready`);
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(ready)) {
    if (Date.now() > deadline) fail(`timed out after ${timeoutMs / 1000}s; the call may still be running or waiting on a permission prompt`, 2);
    try { if (Date.now() - readJson(join(session.dir, 'heartbeat.json')).at > FRESH_MS) fail('the Claude Code session stopped responding', 2); } catch { /* retry */ }
    await pause(40);
  }
  const file = join(session.dir, `res-${id}.json`);
  const value = readJson(file);
  for (const name of [file, ready, join(session.dir, `req-${id}.json`)]) rmSync(name, { force: true });
  return value.value;
}

function flags(argv) {
  const opts = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session') opts.session = argv[++i];
    else if (a === '--timeout') opts.timeout = Number(argv[++i]);
    else if (a === '--stdin') opts.stdin = true;
    else opts.positional.push(a);
  }
  return opts;
}

const USAGE = `mcpx status
mcpx list [text]                      tools available through the session, optionally filtered by text
mcpx call <tool> [json | @file | -]   call a tool; '-' or --stdin reads the JSON arguments from stdin
options: --session <id>  --timeout <seconds, default 300>`;

async function main() {
  const [action, ...rest] = process.argv.slice(2);
  if (action === 'serve-init') {
    // Used by the mod: create a session directory and publish a stable CLI path.
    const id = randomUUID();
    const dir = join(BASE, id);
    mkdirSync(dir, { recursive: true });
    atomic(join(dir, 'session.json'), { cwd: rest[0], started: Date.now() });
    atomic(join(dir, 'heartbeat.json'), { at: Date.now() });
    copyFileSync(fileURLToPath(import.meta.url), join(BASE, 'mcpx.mjs'));
    for (const s of sessions()) if (s.age > 24 * 3600 * 1000) rmSync(s.dir, { recursive: true, force: true });
    return out({ id, dir });
  }
  if (action === 'reply') {
    // Used by the mod for results too large for the SDK file write.
    const [dir, id] = rest;
    const root = resolve(BASE) + sep;
    if (!resolve(dir).startsWith(root) || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('invalid reply target');
    const text = await stdin();
    writeFileSync(join(dir, `res-${id}.json`), text, { mode: 0o600 });
    writeFileSync(join(dir, `res-${id}.ready`), 'ready', { mode: 0o600 });
    return out({ replied: id });
  }
  const opts = flags(rest);
  if (action === 'status') {
    const rows = sessions();
    return out({ base: BASE, sessions: rows.map(s => ({ id: s.id, cwd: s.cwd, live: s.age < FRESH_MS })) });
  }
  const session = pick(opts.session || process.env.MCPX_SESSION);
  const timeoutMs = (opts.timeout || 300) * 1000;
  if (action === 'list') {
    const value = await request(session, { op: 'list' }, timeoutMs);
    const filter = (opts.positional[0] || '').toLowerCase();
    const tools = (value.tools || []).filter(t => !filter || `${t.name} ${t.description}`.toLowerCase().includes(filter));
    return out({ ok: !value.isError && !value.deny, session: session.id, count: tools.length, tools, ...(value.deny ? { error: value.deny } : {}), ...(value.isError ? { error: value.text } : {}) });
  }
  if (action === 'call') {
    const [tool, raw] = opts.positional;
    if (!tool) fail('usage: mcpx call <tool> [json | @file | -]');
    let text = '{}';
    if (opts.stdin || raw === '-') text = await stdin();
    else if (raw && raw.startsWith('@')) text = readFileSync(raw.slice(1), 'utf8');
    else if (raw) text = raw;
    let args;
    try { args = JSON.parse(text); } catch (error) { fail('arguments are not valid JSON: ' + error.message); }
    if (Buffer.byteLength(text) > MAX_FRAME) fail('arguments exceed 250,000 bytes');
    // Slow MCP servers can still be connecting just after session start, so retry briefly.
    const settle = Date.now() + 20000;
    let value;
    do {
      value = await request(session, { op: 'call', tool, args }, timeoutMs);
      if (!String(value.deny || '').startsWith('Tool is not available')) break;
      await pause(2000);
    } while (Date.now() < settle);
    out(value);
    if (value.deny || value.isError) process.exitCode = 1;
    return;
  }
  fail(`unknown command\n${USAGE}`, 64);
}

main().catch(error => fail(String(error.message)));
