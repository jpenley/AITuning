#!/usr/bin/env node
// mcpx: call the MCP tools of a running Claude Code session from a shell.
// Requests go through a spool directory that the code-mode mod's bridge polls,
// so every call uses the session's own connections, auth and permission checks.
import { mkdirSync, writeFileSync, readFileSync, renameSync, readdirSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { join, resolve, sep, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MCPX_HOME || join(homedir(), '.claude', 'mcpx');
const RECIPES = join(BASE, 'recipes');
const USAGE_FILE = join(BASE, 'usage.json');
const FRESH_MS = 15000;
const MAX_FRAME = 250000;
const AUTOSAVE_AT = Number(process.env.MCPX_AUTOSAVE || 3);
const pause = ms => new Promise(done => setTimeout(done, ms));
const atomic = (path, value) => { writeFileSync(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 }); renameSync(`${path}.tmp`, path); };
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const out = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const note = text => process.stderr.write(`mcpx: ${text}\n`);
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
  const opts = { positional: [], set: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session') opts.session = argv[++i];
    else if (a === '--timeout') opts.timeout = Number(argv[++i]);
    else if (a === '--stdin') opts.stdin = true;
    else if (a === '--js') opts.js = argv[++i];
    else if (a === '--set') {
      const pair = argv[++i] || '';
      const at = pair.indexOf('=');
      if (at < 1) fail('--set needs key=value');
      const raw = pair.slice(at + 1);
      let value = raw;
      try { value = JSON.parse(raw); } catch { /* keep the string */ }
      opts.set[pair.slice(0, at)] = value;
    } else opts.positional.push(a);
  }
  return opts;
}

// --- recipes -------------------------------------------------------------

const shortTool = tool => tool.split('__').pop();
const recipePath = name => join(RECIPES, `${name}.json`);
const hash = text => createHash('sha1').update(text).digest('hex').slice(0, 8);

function loadRecipes() {
  if (!existsSync(RECIPES)) return [];
  const rows = [];
  for (const file of readdirSync(RECIPES)) {
    if (!file.endsWith('.json')) continue;
    try { rows.push(readJson(join(RECIPES, file))); } catch { /* skip a damaged recipe */ }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

const summarize = r => ({ name: r.name, tool: shortTool(r.tool), description: r.description, params: Object.entries(r.params || {}).map(([k, v]) => (v && v.required ? `${k}*` : k)), ...(r.auto ? { auto: true } : {}) });

// A repeated call shape is the same tool, argument keys and filter; values may differ.
const signature = (tool, args, js) => hash(JSON.stringify([tool, Object.keys(args).sort(), js || '']));

const PLACEHOLDER = /\{\{(\w+)\}\}/g;
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Does `value` fit a string that holds {{placeholders}}? Returns the captured values by name.
function fit(template, value) {
  const names = [];
  const source = template.split(PLACEHOLDER).map((part, i) => { if (i % 2) { names.push(part); return '(.+?)'; } return escapeRe(part); }).join('');
  const found = new RegExp(`^${source}$`, 's').exec(value);
  return found ? Object.fromEntries(names.map((n, i) => [n, found[i + 1]])) : null;
}

// Two strings that differ in one stretch become a template with a placeholder
// there, widened to whole words so `12345` and `12399` are compared as ids.
function templateOf(a, b, key, taken) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  while (i > 0 && /\w/.test(a[i - 1]) && /\w/.test(b[i - 1])) i--;
  while (j > 0 && /\w/.test(a[a.length - j]) && /\w/.test(b[b.length - j])) j--;
  const was = a.slice(i, a.length - j), now = b.slice(i, b.length - j);
  if (!was || !now || was.length > 80 || now.length > 80 || i + j < 6) return null;
  let name = (/([A-Za-z_]\w*)\W*$/.exec(a.slice(0, i)) || [])[1] || `${key}Value`;
  for (let n = 2; taken.has(name); n++) name = `${name.replace(/\d+$/, '')}${n}`;
  return { name, template: `${a.slice(0, i)}{{${name}}}${a.slice(a.length - j)}`, was, now };
}

// A recipe built from calls that all shared a value keeps it as a default. When a
// later call of the same shape differs, turn the value into a variable instead of
// letting `run` quietly reuse the old one. Returns what changed.
function widen(recipe, args) {
  const changed = [];
  const params = recipe.params || (recipe.params = {});
  for (const [key, value] of Object.entries(args)) {
    if (!(key in recipe.args)) continue;
    const fixed = recipe.args[key];
    if (JSON.stringify(fixed) === JSON.stringify(value)) continue;
    if (typeof fixed === 'string' && typeof value === 'string') {
      if (fit(fixed, value)) continue; // an existing variable already explains the difference
      const split = templateOf(fixed, value, key, new Set(Object.keys(params)));
      if (split) {
        recipe.args[key] = split.template;
        if (params[key]) delete params[key].default;
        params[split.name] = { required: true, template: true, seen: [split.was, split.now] };
        changed.push(`${split.name} in ${key} (was ${split.was}, now ${split.now})`);
        continue;
      }
    }
    delete recipe.args[key];
    params[key] = { required: true, seen: [JSON.stringify(fixed).slice(0, 60), JSON.stringify(value).slice(0, 60)] };
    changed.push(`${key} (was ${JSON.stringify(fixed).slice(0, 40)}, now ${JSON.stringify(value).slice(0, 40)})`);
  }
  return changed;
}

function track(tool, args, js) {
  let usage = {};
  try { usage = readJson(USAGE_FILE); } catch { /* first use */ }
  const sig = signature(tool, args, js);
  const entry = usage[sig] || (usage[sig] = { tool, js: js || null, n: 0, samples: [] });
  entry.n++;
  entry.samples = [...entry.samples, args].slice(-5);
  entry.last = Date.now();
  // Keep the log bounded: drop the least recently used shapes.
  const keys = Object.keys(usage);
  if (keys.length > 200) for (const key of keys.sort((a, b) => usage[a].last - usage[b].last).slice(0, keys.length - 200)) delete usage[key];
  mkdirSync(BASE, { recursive: true });
  atomic(USAGE_FILE, usage);
  const existing = loadRecipes();
  const same = existing.find(r => r.sig === sig);
  if (same) {
    const widened = widen(same, args);
    if (!widened.length) return note(`recipe "${same.name}" covers this call; next time: mcpx run ${same.name}`);
    atomic(recipePath(same.name), same);
    return note(`recipe "${same.name}" had fixed values that differ in this call, so they are now variables: ${widened.join('; ')}. Run: mcpx run ${same.name} --set <name>=...`);
  }
  if (entry.n < AUTOSAVE_AT || !js) return;
  const names = new Set(Object.keys(args));
  const params = {};
  for (const key of names) {
    const values = new Set(entry.samples.map(s => JSON.stringify(s[key])));
    params[key] = values.size > 1 ? { required: true } : { default: args[key] };
  }
  const constant = Object.fromEntries(Object.entries(params).filter(([, v]) => 'default' in v).map(([k, v]) => [k, v.default]));
  const varying = Object.keys(params).filter(k => params[k].required);
  const name = `auto-${shortTool(tool)}-${sig.slice(0, 4)}`;
  mkdirSync(RECIPES, { recursive: true });
  atomic(recipePath(name), { name, description: `Auto-saved after ${entry.n} runs of ${shortTool(tool)} with this filter. Edit with: mcpx recipe desc ${name} "<what it does>"`, tool, args: constant, params, js, sig, auto: true });
  note(`this call shape has run ${entry.n} times; saved recipe "${name}"${varying.length ? ` (set: ${varying.join(', ')})` : ''}. Next time: mcpx run ${name}${varying.map(k => ` --set ${k}=...`).join('')}`);
}

function hintForTool(tool) {
  const have = loadRecipes().filter(r => r.tool === tool).map(r => r.name);
  if (have.length) note(`recipes exist for ${shortTool(tool)}: ${have.join(', ')} (mcpx recipes)`);
}

function runJs(js, value) {
  let r = value.text;
  try { r = JSON.parse(value.text); } catch { /* plain text result */ }
  // A body with `return` is run as a function body; anything else is one expression of r.
  const body = /\breturn\b/.test(js) ? js : `return (${js});`;
  let answer;
  try { answer = new Function('r', body)(r); } catch (error) { fail(`--js failed: ${error.message}. Print the shape first (see RECIPES.md).`); }
  process.stdout.write((typeof answer === 'string' ? answer : JSON.stringify(answer, null, 1)) + '\n');
}

async function callTool(session, tool, args, js, timeoutMs, { track: log }) {
  // Slow MCP servers can still be connecting just after session start, so retry briefly.
  const settle = Date.now() + 20000;
  let value;
  do {
    value = await request(session, { op: 'call', tool, args }, timeoutMs);
    if (!String(value.deny || '').startsWith('Tool is not available')) break;
    await pause(2000);
  } while (Date.now() < settle);
  const bad = value.deny || value.isError;
  if (js && !bad) runJs(js, value);
  else out(value);
  if (bad) process.exitCode = 1;
  else if (log) { track(tool, args, js); if (!js) hintForTool(tool); }
  else if (!js) hintForTool(tool);
}

async function recipeCommand(sub, opts) {
  const [name, ...words] = opts.positional;
  if (!name) fail('usage: mcpx recipe show|desc|rename|rm <name> ...');
  if (!existsSync(recipePath(name))) fail(`no recipe named ${name}`);
  const recipe = readJson(recipePath(name));
  if (sub === 'show') return out(recipe);
  if (sub === 'rm') { rmSync(recipePath(name)); return out({ ok: true, removed: name }); }
  if (sub === 'desc') { recipe.description = words.join(' '); recipe.auto = false; atomic(recipePath(name), recipe); return out({ ok: true, name }); }
  if (sub === 'rename') {
    const next = words[0];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(next || '') || existsSync(recipePath(next))) fail('new name must be lowercase letters, digits and dashes, and unused');
    recipe.name = next; recipe.auto = false;
    atomic(recipePath(next), recipe); rmSync(recipePath(name));
    return out({ ok: true, renamed: next });
  }
  fail('usage: mcpx recipe show|desc|rename|rm <name> ...');
}

const USAGE = `mcpx status                           live sessions and saved recipes
mcpx list [text]                      tools available through the session, optionally filtered by text
mcpx call <tool> [json | @file | -]   call a tool; '-' or --stdin reads the JSON arguments from stdin
mcpx recipes [text]                   saved recipes (params marked * are required)
mcpx run <recipe> [--set key=value]   run a recipe with arguments filled in
mcpx recipe show|desc|rename|rm <name> [...]
options: --js '<expression or function body of r>'  --session <id>  --timeout <seconds, default 300>`;

async function main() {
  const [action, ...rest] = process.argv.slice(2);
  if (action === 'serve-init') {
    // Used by the mod: create a session directory, publish a stable CLI path and seed recipes.
    const id = randomUUID();
    const dir = join(BASE, id);
    mkdirSync(dir, { recursive: true });
    atomic(join(dir, 'session.json'), { cwd: rest[0], started: Date.now() });
    atomic(join(dir, 'heartbeat.json'), { at: Date.now() });
    const here = fileURLToPath(import.meta.url);
    copyFileSync(here, join(BASE, 'mcpx.mjs'));
    const seeds = join(dirname(here), '..', 'recipes');
    if (existsSync(seeds)) {
      mkdirSync(RECIPES, { recursive: true });
      for (const file of readdirSync(seeds)) if (file.endsWith('.json') && !existsSync(join(RECIPES, file))) copyFileSync(join(seeds, file), join(RECIPES, file));
    }
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
  const filter = (opts.positional[0] || '').toLowerCase();
  if (action === 'status') {
    const rows = sessions();
    return out({ base: BASE, sessions: rows.map(s => ({ id: s.id, cwd: s.cwd, live: s.age < FRESH_MS })), recipes: loadRecipes().map(summarize), recipeHelp: 'mcpx run <recipe> --set key=value; mcpx recipes for details' });
  }
  if (action === 'recipes') return out({ count: loadRecipes().length, recipes: loadRecipes().filter(r => !filter || JSON.stringify(r).toLowerCase().includes(filter)).map(r => ({ ...summarize(r), params: r.params, defaults: r.args })) });
  if (action === 'recipe') return recipeCommand(rest[0], flags(rest.slice(1)));
  const session = pick(opts.session || process.env.MCPX_SESSION);
  const timeoutMs = (opts.timeout || 300) * 1000;
  if (action === 'list') {
    const value = await request(session, { op: 'list' }, timeoutMs);
    const tools = (value.tools || []).filter(t => !filter || `${t.name} ${t.description}`.toLowerCase().includes(filter));
    return out({ ok: !value.isError && !value.deny, session: session.id, count: tools.length, tools, ...(value.deny ? { error: value.deny } : {}), ...(value.isError ? { error: value.text } : {}) });
  }
  if (action === 'run') {
    const name = opts.positional[0];
    if (!name || !existsSync(recipePath(name))) fail(`no recipe named ${name || ''}; see: mcpx recipes`);
    const recipe = readJson(recipePath(name));
    // Values for {{placeholders}} fill the templates; they are not tool arguments themselves.
    const direct = Object.fromEntries(Object.entries(opts.set).filter(([k]) => !(recipe.params?.[k]?.template)));
    const merged = { ...recipe.args, ...direct };
    const args = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, typeof v === 'string' ? v.replace(PLACEHOLDER, (all, n) => (n in opts.set ? String(opts.set[n]) : all)) : v]));
    const missing = Object.entries(recipe.params || {}).filter(([k, v]) => v && v.required && !(v.template ? k in opts.set : k in args)).map(([k]) => k);
    if (missing.length) fail(`recipe ${name} needs --set ${missing.join(' --set ')}`);
    return callTool(session, recipe.tool, args, opts.js || recipe.js, timeoutMs, { track: false });
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
    return callTool(session, tool, args, opts.js, timeoutMs, { track: true });
  }
  fail(`unknown command\n${USAGE}`, 64);
}

main().catch(error => fail(String(error.message)));
