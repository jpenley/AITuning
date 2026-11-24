#!/usr/bin/env node
// Runs one consult session: serves a local page built from a spec (questions, options, and context blocks of
// markdown, Mermaid, images, or sandboxed HTML), waits for the user to submit, cancel, or close the tab, then prints
// one answer object as JSON on stdout, writes the same object to <spec>.answer.json, and exits. Built to be started
// in the background so the agent is re-invoked when the process exits. No packages; Mermaid is bundled in vendor/.
//
//   node consult.mjs serve <spec.json> [--no-open] [--timeout <s>] [--connect-timeout <s>] [--grace <s>]
//   node consult.mjs check <spec.json>
//   node consult.mjs --selftest
// serve: prints the page URL on stderr and opens it in the default browser unless --no-open. --timeout ends the
//   session after <s> seconds (default: none). --connect-timeout ends it as closed when no tab connects within <s>
//   seconds (default 120). --grace is how long a disconnected tab may take to reconnect, e.g. on reload (default 20).
// check: validates the spec only and prints { status: "valid", questions } or the error object.
// Output: { status, specId, title, answerFile, endedAt, answers: [{ id, prompt, kind, answered, selected: [{ id,
//   label }], other, text, note, followedRecommendation }] }. Questions hidden by showIf are omitted. On error:
//   { status: "error", error, problems? }.
// Exit: 0 submitted (or check: valid), 1 error (bad usage, invalid spec, couldn't serve), 2 cancelled by the user,
//   3 tab closed or never opened, 4 timed out. 2-4 carry whatever the user had answered so far.
// Security: binds 127.0.0.1 on a random port; every request needs the per-session token; POSTs need this origin;
// the Host header must match (DNS rebinding); HTML blocks render in sandboxed iframes with an opaque origin, so
// their scripts cannot reach the form or the server; markdown is escaped before formatting (no raw HTML).
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, extname, isAbsolute, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXIT = { submitted: 0, valid: 0, error: 1, cancelled: 2, closed: 3, timeout: 4 };
const KINDS = ['single', 'multi', 'text'];
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const MAX_BODY = 1_000_000;
const log = (s) => process.stderr.write(`consult: ${s}\n`);

// ---------- spec validation ----------

// Every problem at once, each with the JSON path it sits at, so one fix round clears them all.
export function validateSpec(spec, specDir) {
  const problems = [];
  const bad = (path, msg) => problems.push(`${path}: ${msg}`);
  const keys = (obj, path, allowed) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { bad(path, 'must be an object'); return false; }
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) bad(`${path}.${k}`, `unknown key (allowed: ${allowed.join(', ')})`);
    return true;
  };
  const str = (v, path, required) => {
    if (v === undefined) { if (required) bad(path, 'required'); return; }
    if (typeof v !== 'string' || !v.trim()) bad(path, 'must be a non-empty string');
  };
  const context = (c, path) => {
    if (c === undefined) return;
    if (!keys(c, path, ['markdown', 'mermaid', 'images', 'html'])) return;
    if (!Object.keys(c).length) bad(path, 'needs at least one of markdown, mermaid, images, html');
    for (const k of ['markdown', 'mermaid', 'html']) str(c[k], `${path}.${k}`, false);
    if (c.images === undefined) return;
    if (!Array.isArray(c.images) || !c.images.length) { bad(`${path}.images`, 'must be a non-empty array'); return; }
    c.images.forEach((img, i) => {
      const p = `${path}.images[${i}]`;
      if (!keys(img, p, ['path', 'alt'])) return;
      str(img.path, `${p}.path`, true);
      str(img.alt, `${p}.alt`, true);
      if (typeof img.path !== 'string') return;
      const full = resolveImage(specDir, img.path);
      if (!full) bad(`${p}.path`, 'must be a relative path inside the spec\'s folder');
      else if (!IMAGE_TYPES[extname(full).toLowerCase()]) bad(`${p}.path`, `unsupported type (use ${Object.keys(IMAGE_TYPES).join(' ')})`);
      else if (!existsSync(full) || !statSync(full).isFile()) bad(`${p}.path`, `file not found: ${full}`);
    });
  };

  if (!keys(spec, 'spec', ['id', 'title', 'context', 'pages', 'questions'])) return problems;
  str(spec.id, 'spec.id', false);
  str(spec.title, 'spec.title', false);
  context(spec.context, 'spec.context');
  if (!Array.isArray(spec.questions) || !spec.questions.length) { bad('spec.questions', 'must be a non-empty array'); return problems; }

  const seen = new Map();
  spec.questions.forEach((q, qi) => {
    const p = `questions[${qi}]`;
    if (!keys(q, p, ['id', 'kind', 'prompt', 'context', 'options', 'allowOther', 'required', 'min', 'max', 'showIf'])) return;
    if (typeof q.id !== 'string' || !ID.test(q.id)) bad(`${p}.id`, 'must match [A-Za-z0-9][A-Za-z0-9_.-]*');
    else if (seen.has(q.id)) bad(`${p}.id`, `duplicate question id "${q.id}"`);
    if (!KINDS.includes(q.kind)) bad(`${p}.kind`, `must be one of ${KINDS.join(', ')}`);
    str(q.prompt, `${p}.prompt`, true);
    context(q.context, `${p}.context`);
    for (const k of ['allowOther', 'required']) if (q[k] !== undefined && typeof q[k] !== 'boolean') bad(`${p}.${k}`, 'must be true or false');

    if (q.kind === 'text') {
      for (const k of ['options', 'allowOther', 'min', 'max']) if (q[k] !== undefined) bad(`${p}.${k}`, 'not allowed on a text question');
    } else if (KINDS.includes(q.kind)) {
      if (!Array.isArray(q.options) || !q.options.length) bad(`${p}.options`, 'must be a non-empty array');
      const optIds = new Set();
      (Array.isArray(q.options) ? q.options : []).forEach((o, oi) => {
        const op = `${p}.options[${oi}]`;
        if (!keys(o, op, ['id', 'label', 'detail', 'recommended', 'why'])) return;
        if (typeof o.id !== 'string' || !ID.test(o.id)) bad(`${op}.id`, 'must match [A-Za-z0-9][A-Za-z0-9_.-]*');
        else if (optIds.has(o.id)) bad(`${op}.id`, `duplicate option id "${o.id}"`);
        else optIds.add(o.id);
        str(o.label, `${op}.label`, true);
        context(o.detail, `${op}.detail`);
        if (o.recommended !== undefined && typeof o.recommended !== 'boolean') bad(`${op}.recommended`, 'must be true or false');
        if (o.why !== undefined && o.recommended !== true) bad(`${op}.why`, 'only allowed on a recommended option');
        str(o.why, `${op}.why`, false);
      });
      const recs = (q.options ?? []).filter((o) => o?.recommended === true).length;
      if (q.kind === 'single' && recs > 1) bad(`${p}.options`, 'a single question can recommend at most one option');
      const choices = (q.options?.length ?? 0) + (q.allowOther ? 1 : 0);
      if (q.kind === 'single') for (const k of ['min', 'max']) if (q[k] !== undefined) bad(`${p}.${k}`, 'only allowed on a multi question');
      if (q.kind === 'multi') {
        for (const k of ['min', 'max']) if (q[k] !== undefined && !(Number.isInteger(q[k]) && q[k] >= 1)) bad(`${p}.${k}`, 'must be an integer of at least 1');
        if (Number.isInteger(q.min) && Number.isInteger(q.max) && q.min > q.max) bad(`${p}.min`, 'must not exceed max');
        if (Number.isInteger(q.min) && q.min > choices) bad(`${p}.min`, `exceeds the ${choices} available choices`);
      }
    }

    if (q.showIf !== undefined) {
      const ok = q.showIf && typeof q.showIf === 'object' && !Array.isArray(q.showIf);
      if (!ok || !Object.keys(q.showIf).length) bad(`${p}.showIf`, 'must be an object naming at least one earlier question');
      for (const [pid, want] of Object.entries(ok ? q.showIf : {})) {
        const parent = seen.get(pid);
        if (!parent) { bad(`${p}.showIf.${pid}`, 'must refer to a question listed earlier in questions'); continue; }
        if (parent.kind === 'text') { bad(`${p}.showIf.${pid}`, 'must refer to a single or multi question'); continue; }
        const wants = Array.isArray(want) ? want : [want];
        if (!wants.length) bad(`${p}.showIf.${pid}`, 'must name at least one option id');
        for (const w of wants) if (!parent.options?.some((o) => o?.id === w)) bad(`${p}.showIf.${pid}`, `"${parent.id}" has no option "${w}"`);
      }
    }
    if (typeof q.id === 'string' && !seen.has(q.id)) seen.set(q.id, q);
  });

  if (spec.pages !== undefined) {
    if (!Array.isArray(spec.pages) || !spec.pages.length) bad('spec.pages', 'must be a non-empty array (or omitted for one page)');
    const pageOf = new Map();
    (Array.isArray(spec.pages) ? spec.pages : []).forEach((pg, pi) => {
      const p = `pages[${pi}]`;
      if (!keys(pg, p, ['title', 'context', 'questions'])) return;
      str(pg.title, `${p}.title`, false);
      context(pg.context, `${p}.context`);
      if (!Array.isArray(pg.questions) || !pg.questions.length) { bad(`${p}.questions`, 'must be a non-empty array of question ids'); return; }
      for (const id of pg.questions) {
        if (!seen.has(id)) bad(`${p}.questions`, `unknown question "${id}"`);
        else if (pageOf.has(id)) bad(`${p}.questions`, `"${id}" is already on page ${pageOf.get(id) + 1}`);
        else pageOf.set(id, pi);
      }
    });
    for (const [id, q] of seen) {
      if (!pageOf.has(id)) { bad('spec.pages', `question "${id}" is on no page`); continue; }
      for (const pid of Object.keys(q.showIf ?? {})) {
        if (pageOf.get(pid) > pageOf.get(id)) bad('spec.pages', `"${id}" depends on "${pid}", which is on a later page`);
      }
    }
  }
  return problems;
}

function resolveImage(specDir, rel) {
  if (typeof rel !== 'string' || isAbsolute(rel)) return null;
  const full = resolve(specDir, rel);
  return full.startsWith(specDir + sep) ? full : null;
}

// ---------- answers ----------

const optionsOf = (q) => q.options ?? [];

// Keep only what the spec allows: option ids that exist, one selection for a single question, strings for text.
export function sanitize(spec, raw) {
  const out = {};
  for (const q of spec.questions) {
    const r = raw && typeof raw === 'object' ? raw[q.id] : undefined;
    if (!r || typeof r !== 'object') continue;
    const ids = new Set(optionsOf(q).map((o) => o.id));
    let selected = Array.isArray(r.selected) ? [...new Set(r.selected.filter((id) => ids.has(id)))] : [];
    if (q.kind === 'single') selected = selected.slice(0, 1);
    const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 20_000) : null);
    out[q.id] = { selected, other: q.allowOther ? s(r.other) : null, text: q.kind === 'text' ? s(r.text) : null, note: s(r.note) };
  }
  return out;
}

export function isVisible(spec, q, answers) {
  if (!q.showIf) return true;
  return Object.entries(q.showIf).every(([pid, want]) => {
    const parent = spec.questions.find((x) => x.id === pid);
    const sel = answers[pid]?.selected ?? [];
    return isVisible(spec, parent, answers) && [].concat(want).some((w) => sel.includes(w));
  });
}

// What blocks a submit: required and min/max on visible questions. "Other" text counts as one choice.
export function submitProblems(spec, answers) {
  const problems = [];
  for (const q of spec.questions) {
    if (!isVisible(spec, q, answers)) continue;
    const a = answers[q.id] ?? {};
    const n = (a.selected?.length ?? 0) + (a.other ? 1 : 0);
    if (q.kind === 'text') { if (q.required && !a.text) problems.push({ id: q.id, problem: 'Required.' }); continue; }
    if (q.required && n === 0) problems.push({ id: q.id, problem: 'Required.' });
    else if (q.kind === 'multi' && n > 0 && q.min && n < q.min) problems.push({ id: q.id, problem: `Choose at least ${q.min}.` });
    else if (q.kind === 'multi' && q.max && n > q.max) problems.push({ id: q.id, problem: `Choose at most ${q.max}.` });
    else if (q.kind === 'single' && n > 1) problems.push({ id: q.id, problem: 'Choose one option or write your own, not both.' });
  }
  return problems;
}

export function buildAnswer(spec, answers, status, answerFile) {
  const list = [];
  for (const q of spec.questions) {
    if (!isVisible(spec, q, answers)) continue;
    const a = answers[q.id] ?? { selected: [], other: null, text: null, note: null };
    const selected = a.selected.map((id) => optionsOf(q).find((o) => o.id === id)).map((o) => ({ id: o.id, label: o.label }));
    const recIds = optionsOf(q).filter((o) => o.recommended).map((o) => o.id);
    let followedRecommendation = null;
    if (recIds.length && (selected.length || a.other)) {
      followedRecommendation = !a.other && recIds.every((id) => a.selected.includes(id));
    }
    list.push({
      id: q.id,
      prompt: q.prompt,
      kind: q.kind,
      answered: selected.length > 0 || !!a.other || !!a.text,
      selected,
      other: a.other,
      text: a.text,
      note: a.note,
      followedRecommendation,
    });
  }
  return { status, specId: spec.id ?? null, title: spec.title ?? null, answerFile, endedAt: new Date().toISOString(), answers: list };
}

// ---------- session ----------

// Resolves with the answer object once the session ends; never exits the process itself.
export function runSession(spec, specPath, opts = {}) {
  const { open = true, timeoutMs = 0, connectTimeoutMs = 120_000, graceMs = 20_000, onReady = () => {} } = opts;
  const specDir = dirname(specPath);
  const answerFile = specPath.replace(/\.json$/i, '') + '.answer.json';
  const token = randomBytes(24).toString('hex');
  const page = readFileSync(join(HERE, 'page.html'), 'utf8');
  const usesMermaid = JSON.stringify(spec).includes('"mermaid"');
  let answers = {};
  const clients = new Set();
  let graceTimer = null;
  let timeoutTimer = null;
  let ended = false;

  return new Promise((resolveSession, rejectSession) => {
    const server = http.createServer((req, res) => {
      try { handle(req, res); } catch (e) { send(res, 500, String(e?.message ?? e)); }
    });
    server.on('error', rejectSession);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/?t=${token}`;
      log(`open ${url}`);
      if (open) openBrowser(url);
      graceTimer = setTimeout(() => end('closed'), connectTimeoutMs);
      if (timeoutMs > 0) timeoutTimer = setTimeout(() => end('timeout'), timeoutMs);
      onReady({ url, port, token });
    });

    function handle(req, res) {
      const { port } = server.address();
      const origin = `http://127.0.0.1:${port}`;
      const url = new URL(req.url, origin);
      if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, 'bad host');
      if (url.pathname === '/favicon.ico') return send(res, 204, '');
      if (url.searchParams.get('t') !== token) return send(res, 403, 'bad token');
      if (req.method === 'POST' && req.headers.origin !== origin) return send(res, 403, 'bad origin');
      if (req.method === 'GET') {
        if (url.pathname === '/') return send(res, 200, page, 'text/html; charset=utf-8', true);
        if (url.pathname === '/spec') return send(res, 200, JSON.stringify({ spec, answers, usesMermaid }), 'application/json');
        if (url.pathname === '/events') return events(req, res);
        if (url.pathname === '/vendor/mermaid.js') return send(res, 200, readFileSync(join(HERE, 'vendor', 'mermaid.min.js')), 'text/javascript');
        if (url.pathname === '/image') return image(url.searchParams.get('path'), res);
      }
      if (req.method === 'POST' && ['/draft', '/submit', '/cancel'].includes(url.pathname)) {
        return readBody(req, res, (body) => {
          if (ended) return send(res, 409, 'session ended');
          answers = sanitize(spec, body);
          if (url.pathname === '/draft') return send(res, 204, '');
          if (url.pathname === '/cancel') { send(res, 204, ''); return end('cancelled'); }
          const problems = submitProblems(spec, answers);
          if (problems.length) return send(res, 422, JSON.stringify({ problems }), 'application/json');
          send(res, 204, '');
          end('submitted');
        });
      }
      send(res, 404, 'not found');
    }

    function events(req, res) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      clearTimeout(graceTimer);
      const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
        if (!ended && clients.size === 0) {
          log(`tab disconnected; ending as closed unless it reconnects within ${Math.round(graceMs / 1000)}s`);
          graceTimer = setTimeout(() => end('closed'), graceMs);
        }
      });
    }

    function image(rel, res) {
      const full = resolveImage(specDir, rel);
      const type = full && IMAGE_TYPES[extname(full).toLowerCase()];
      if (!type || !existsSync(full)) return send(res, 404, 'no such image');
      send(res, 200, readFileSync(full), type);
    }

    function end(status) {
      if (ended) return;
      ended = true;
      clearTimeout(graceTimer);
      clearTimeout(timeoutTimer);
      const answer = buildAnswer(spec, answers, status, answerFile);
      try { writeFileSync(answerFile, JSON.stringify(answer, null, 2) + '\n'); } catch (e) { log(`could not write ${answerFile}: ${e.message}`); answer.answerFile = null; }
      for (const c of clients) { c.write(`event: done\ndata: ${status}\n\n`); c.end(); }
      server.close();
      server.closeAllConnections?.();
      resolveSession(answer);
    }
    process.once('SIGINT', () => end('cancelled'));
    process.once('SIGTERM', () => end('cancelled'));
  });
}

const CSP = ["default-src 'none'", "script-src 'self' 'unsafe-inline'", "style-src 'unsafe-inline'", "img-src 'self' data:",
  "font-src 'self' data:", "connect-src 'self'", "frame-src 'self'", "base-uri 'none'", "form-action 'none'"].join('; ');

function send(res, code, body, type = 'text/plain; charset=utf-8', page = false) {
  const headers = { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
  if (page) Object.assign(headers, { 'content-security-policy': CSP, 'x-frame-options': 'DENY' });
  res.writeHead(code, headers);
  res.end(body);
}

function readBody(req, res, cb) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { send(res, 413, 'too large'); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (size > MAX_BODY) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return send(res, 400, 'invalid JSON'); }
    cb(body);
  });
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${url}"`]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' });
    child.on('error', () => log('could not open a browser; open the URL above by hand'));
    child.unref();
  } catch { log('could not open a browser; open the URL above by hand'); }
}

// ---------- CLI ----------

function loadSpec(path) {
  let spec;
  try { spec = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { return { error: { status: 'error', error: `cannot read spec: ${e.message}` } }; }
  const problems = validateSpec(spec, dirname(path));
  if (problems.length) return { error: { status: 'error', error: `spec invalid: ${problems.length} problem(s)`, problems } };
  return { spec };
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n', () => process.exit(EXIT[obj.status] ?? 1));
}

async function main(argv) {
  if (argv[0] === '--selftest') return selftest();
  const [cmd, file, ...rest] = argv;
  const flag = (name) => { const i = rest.indexOf(name); return i > -1 ? Number(rest[i + 1]) : undefined; };
  const usage = 'usage: consult serve <spec.json> [--no-open] [--timeout <s>] [--connect-timeout <s>] [--grace <s>] | consult check <spec.json> | consult --selftest';
  if (!['serve', 'check'].includes(cmd) || !file) return emit({ status: 'error', error: usage });
  for (const name of ['--timeout', '--connect-timeout', '--grace']) {
    const v = flag(name);
    if (v !== undefined && !(v > 0)) return emit({ status: 'error', error: `${name} needs a positive number of seconds` });
  }
  const specPath = resolve(file);
  const { spec, error } = loadSpec(specPath);
  if (error) return emit(error);
  if (cmd === 'check') return emit({ status: 'valid', questions: spec.questions.length });
  try {
    const answer = await runSession(spec, specPath, {
      open: !rest.includes('--no-open'),
      timeoutMs: (flag('--timeout') ?? 0) * 1000,
      connectTimeoutMs: (flag('--connect-timeout') ?? 120) * 1000,
      graceMs: (flag('--grace') ?? 20) * 1000,
    });
    emit(answer);
  } catch (e) {
    emit({ status: 'error', error: `could not serve: ${e.message}` });
  }
}

// ---------- selftest ----------

async function selftest() {
  let failed = 0;
  const check = (ok, name) => { if (!ok) { failed++; log(`FAIL ${name}`); } };
  const dir = mkdtempSync(join(tmpdir(), 'consult-selftest-'));
  try {
    writeFileSync(join(dir, 'pic.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    const spec = {
      id: 'demo', title: 'Demo',
      pages: [{ title: 'One', questions: ['store', 'ttl'] }, { title: 'Two', questions: ['inv', 'notes'] }],
      questions: [
        { id: 'store', kind: 'single', prompt: 'Where?', required: true, allowOther: true, context: { mermaid: 'graph LR; A-->B', images: [{ path: 'pic.png', alt: 'pic' }] },
          options: [{ id: 'mem', label: 'Memory' }, { id: 'redis', label: 'Redis', recommended: true, why: 'shared' }] },
        { id: 'ttl', kind: 'single', prompt: 'TTL?', showIf: { store: 'redis' }, options: [{ id: '5m', label: '5 min', recommended: true }, { id: '1h', label: '1 hour' }] },
        { id: 'inv', kind: 'multi', prompt: 'Invalidate on?', min: 1, max: 2, options: [{ id: 'etl', label: 'ETL', recommended: true }, { id: 'edit', label: 'Edit' }, { id: 'manual', label: 'Manual' }] },
        { id: 'notes', kind: 'text', prompt: 'Anything else?' },
      ],
    };
    check(validateSpec(spec, dir).length === 0, 'valid spec passes');
    const broken = JSON.parse(JSON.stringify(spec));
    broken.questions[0].requried = true;
    broken.questions[1].showIf = { inv: 'etl' };
    broken.questions[2].min = 3; broken.questions[2].max = 2;
    broken.questions[3].options = [{ id: 'x', label: 'X' }];
    broken.questions[0].context.images = [{ path: '../escape.png', alt: 'x' }];
    broken.pages[1].questions = ['inv'];
    const p = validateSpec(broken, dir);
    for (const [needle, name] of [['requried: unknown key', 'typo key'], ['showIf.inv: must refer to a question listed earlier', 'forward showIf'], ['min: must not exceed max', 'min > max'],
      ['options: not allowed on a text question', 'text options'], ['inside the spec', 'image escape'], ['"notes" is on no page', 'page coverage']]) {
      check(p.some((x) => x.includes(needle)), `reports ${name}`);
    }
    check(validateSpec({ questions: [{ id: 'a', kind: 'single', prompt: 'A', options: [{ id: 'x', label: 'X', why: 'no' }] }] }, dir).some((x) => x.includes('only allowed on a recommended')), 'why needs recommended');

    const raw = { store: { selected: ['redis', 'bogus'] }, ttl: { selected: ['1h', '5m'] }, inv: { selected: ['etl'] }, notes: { text: '  keep it  ', selected: ['x'] } };
    const a = sanitize(spec, raw);
    check(a.store.selected.join() === 'redis', 'unknown option dropped');
    check(a.ttl.selected.join() === '1h', 'single keeps one selection');
    check(a.notes.text === 'keep it' && a.notes.selected.length === 0, 'text trimmed, no options');
    const ans = buildAnswer(spec, a, 'submitted', 'f.json');
    const by = Object.fromEntries(ans.answers.map((x) => [x.id, x]));
    check(by.store.followedRecommendation === true && by.ttl.followedRecommendation === false, 'followedRecommendation');
    check(by.store.selected[0].label === 'Redis', 'labels echoed');
    check(by.notes.followedRecommendation === null, 'no recommendation is null');
    const hidden = buildAnswer(spec, sanitize(spec, { ...raw, store: { selected: ['mem'] } }), 'closed', null);
    check(!hidden.answers.some((x) => x.id === 'ttl'), 'hidden question omitted');
    check(submitProblems(spec, sanitize(spec, {})).some((x) => x.id === 'store'), 'required blocks submit');
    check(submitProblems(spec, sanitize(spec, { store: { selected: ['mem'] }, inv: { selected: ['etl', 'edit', 'manual'] } })).some((x) => x.id === 'inv'), 'max blocks submit');
    check(submitProblems(spec, sanitize(spec, { store: { selected: ['mem'], other: 'disk' } })).some((x) => x.id === 'store'), 'single with other and option blocks');

    // A real server round trip: guards, a rejected submit, a valid submit.
    const specPath = join(dir, 'demo.json');
    writeFileSync(specPath, JSON.stringify(spec));
    let ready;
    const readyP = new Promise((r) => { ready = r; });
    const session = runSession(spec, specPath, { open: false, onReady: ready });
    const { port, token } = await readyP;
    const origin = `http://127.0.0.1:${port}`;
    const req = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((res, rej) => {
      const r = http.request({ host: '127.0.0.1', port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (resp) => {
        const chunks = []; resp.on('data', (c) => chunks.push(c)); resp.on('end', () => res({ status: resp.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      r.on('error', rej); if (body) r.write(body); r.end();
    });
    const t = `t=${token}`;
    check((await req('/spec')).status === 403, 'no token rejected');
    check((await req(`/spec?${t}`, { headers: { host: `evil.test:${port}` } })).status === 403, 'foreign host rejected');
    check((await req(`/submit?${t}`, { method: 'POST', headers: { origin: 'null' }, body: '{}' })).status === 403, 'null origin rejected');
    check((await req(`/image?${t}&path=..%2Fx.png`)).status === 404, 'image escape rejected');
    check((await req(`/image?${t}&path=pic.png`)).status === 200, 'image served');
    check((await req(`/?${t}`)).body.includes('<main'), 'page served');
    check((await req(`/vendor/mermaid.js?${t}`)).status === 200, 'mermaid served');
    const post = (path, obj) => req(`${path}?${t}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(obj) });
    check((await post('/submit', {})).status === 422, 'invalid submit rejected');
    check((await post('/submit', { store: { selected: ['redis'] }, ttl: { selected: ['5m'] }, inv: { selected: ['etl'] } })).status === 204, 'valid submit accepted');
    const done = await session;
    check(done.status === 'submitted' && done.answers.length === 4, 'session resolves submitted');
    check(JSON.parse(readFileSync(join(dir, 'demo.answer.json'), 'utf8')).status === 'submitted', 'answer file written');

    // Closed: a tab that connects and drops ends the session after the grace period.
    let ready2;
    const ready2P = new Promise((r) => { ready2 = r; });
    const session2 = runSession(spec, specPath, { open: false, graceMs: 150, onReady: ready2 });
    const s2 = await ready2P;
    await new Promise((res) => {
      const r = http.request({ host: '127.0.0.1', port: s2.port, path: `/events?t=${s2.token}`, headers: { host: `127.0.0.1:${s2.port}` } }, (resp) => {
        resp.once('data', () => { r.destroy(); res(); });
      });
      r.on('error', () => {}); r.end();
    });
    check((await session2).status === 'closed', 'dropped tab ends as closed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  log(failed ? `selftest: ${failed} failure(s)` : 'selftest: ok');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
