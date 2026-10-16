// Wording micro-test (tune/TESTING.md step 2): one fresh sample per call, with no shell (see codexArgs). Spends tokens.
//
//   node micro.mjs <test-dir> [reps=5] [targets=enabled CLI and HTTP micro targets]
//                  [--jobs N=6] [--timeout <seconds per sample>=600] [--targets <file>]
//   node micro.mjs --selftest
//
// <test-dir> holds task.md (the user message) and one or more variant-*.md files (the guidance in context;
// an empty file is the no-guidance control). Replies land in <test-dir>/out/<variant>.<target>.<rep>.md;
// seconds and tokens per sample in <test-dir>/out/stats.json, with mean and spread per arm on stderr.
// Targets are ids from evals/targets.json; disabled ones are skipped.
// Exit: 0 every sample written, 1 some samples failed (their files start with ERROR), 2 could not run.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './lib/proc.mjs';
import { resolveCommand } from './lib/cli.mjs';
import { CODEX_OFF, codexConfig, writeBackAuth } from './lib/codex-home.mjs';
import { provenance, sha256, cliVersion } from './lib/provenance.mjs';
import { chat } from './lib/chat.mjs';
import { sessionFailure } from './lib/routing.mjs';

const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const HARNESSES = ['claude', 'codex'];
const log = (s = '') => process.stderr.write(s + '\n');
const finish = (result, code) => {
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(code);
};

// Picks CLI and explicitly configured HTTP micro targets. A named target that is
// disabled or whose harness isn't installed is skipped with a note; an unknown or unsupported one is an error.
export function selectTargets(config, ids, resolve = resolveCommand) {
  const all = config.targets ?? [];
  const chosen = ids ? ids.map((id) => all.find((t) => t.id === id) ?? { id, missing: true }) : all.filter((t) => HARNESSES.includes(t.harness) || t.microTransport === 'openai');
  const live = [];
  const skipped = [];
  for (const t of chosen) {
    if (t.missing) throw new Error(`no target named ${t.id} in targets.json`);
    if (t.microTransport === 'openai') {
      if (!t.enabled) { skipped.push({ id: t.id, why: 'disabled in targets.json' }); continue; }
      if (!t.baseURL || !t.apiModel) throw new Error(`target ${t.id}: micro OpenAI transport requires baseURL and apiModel`);
      live.push({ ...t }); continue;
    }
    if (!HARNESSES.includes(t.harness)) throw new Error(`target ${t.id}: harness ${t.harness} not supported (claude or codex)`);
    if (!t.enabled) { skipped.push({ id: t.id, why: 'disabled in targets.json' }); continue; }
    const bin = t.command ? [].concat(t.command) : resolve(t.harness);
    if (!bin) { skipped.push({ id: t.id, why: `${t.harness} not found on PATH` }); continue; }
    live.push({ ...t, bin });
  }
  return { live, skipped };
}

// ---------- test dir ----------

export function promptFor(task, guidance) {
  if (!guidance.trim()) return task;
  return `You are working with the following skill loaded. Follow it.\n\n<skill>\n${guidance}\n</skill>\n\n${task}`;
}

export function planJobs(dir, reps, targets) {
  if (!existsSync(join(dir, 'task.md'))) throw new Error(`${join(dir, 'task.md')} not found`);
  const task = readFileSync(join(dir, 'task.md'), 'utf8');
  const variants = readdirSync(dir).filter((f) => /^variant-.*\.md$/.test(f)).sort();
  if (!variants.length) throw new Error(`no variant-*.md files in ${dir}`);
  const jobs = [];
  for (const v of variants) {
    const guidance = readFileSync(join(dir, v), 'utf8');
    const text = promptFor(task, guidance);
    for (const t of targets) for (let i = 1; i <= reps; i++) jobs.push({ variant: basename(v, '.md'), control: !guidance.trim(), target: t.id, rep: i, text, file: `${basename(v, '.md')}.${t.id}.${i}.md` });
  }
  return jobs;
}

// ---------- Codex isolation ----------

// A private CODEX_HOME per sample (lib/codex-home.mjs); CODEX_OFF keeps the sample tool-less.
export function codexArgs(t, ws, outFile) {
  const a = ['exec', '--ephemeral', '--skip-git-repo-check', '--json', '-C', ws, '-s', 'read-only', '-o', outFile, '-c', 'approval_policy="never"', '-c', 'web_search="disabled"'];
  for (const f of CODEX_OFF) a.push('--disable', f);
  if (t.model) a.push('-m', t.model);
  if (t.effort) a.push('-c', `model_reasoning_effort="${t.effort}"`);
  a.push('-');
  return a;
}

const CODEX_SRC = process.env.CODEX_HOME ?? join(homedir(), '.codex');

function clearReadOnly(p) {
  const st = lstatSync(p);
  if (st.isSymbolicLink()) return;
  chmodSync(p, st.isDirectory() ? 0o777 : 0o666);
  if (st.isDirectory()) for (const e of readdirSync(p)) clearReadOnly(join(p, e));
}

// A sample's processes can outlive it for a moment and hold files open (EPERM/EBUSY on Windows), and a
// sample may leave read-only files. Retry, then clear read-only attributes and try once more; if the
// workspace still won't go, warn and leave it rather than lose the reply and every queued sample.
export function removeWorkspace(ws, rm = rmSync) {
  try {
    rm(ws, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    return true;
  } catch (first) {
    try {
      clearReadOnly(ws);
      rm(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      return true;
    } catch (e) {
      log(`warning: could not remove sample workspace ${ws} (${first.code ?? first.message}; after clearing read-only: ${e.code ?? e.message}); delete it by hand.`);
      return false;
    }
  }
}

// ---------- cost ----------

// Claude's --output-format json: one object with the reply in `result` and token counts in `usage`.
// Anything else (an older CLI, a plain-text reply) keeps the raw text and records no tokens.
export function parseClaudeJson(out) {
  try {
    const o = JSON.parse(out);
    if (typeof o?.result !== 'string') return { text: out, tokens: null };
    const u = o.usage ?? {};
    const input = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    return { text: o.result, tokens: o.usage ? { input, output: u.output_tokens ?? 0 } : null };
  } catch {
    return { text: out, tokens: null };
  }
}

// Codex --json: JSONL events; each finished turn carries `usage` (input includes cached input). Event names change
// between versions, so sum every `usage` object on a turn-completion event and give up (null) when there is none.
export function parseCodexUsage(out) {
  let input = 0;
  let output = 0;
  let seen = false;
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const u = ev?.usage ?? ev?.msg?.usage;
    if (!u || !/turn[._]?complete|token_count/i.test(String(ev.type ?? ev?.msg?.type ?? ''))) continue;
    seen = true;
    input += u.input_tokens ?? 0;
    output += u.output_tokens ?? 0;
  }
  return seen ? { input, output } : null;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => (xs.length < 2 ? 0 : Math.sqrt(xs.reduce((a, x) => a + (x - mean(xs)) ** 2, 0) / (xs.length - 1)));

// Mean and spread of seconds and tokens per variant and target, over the samples that succeeded.
export function summarise(stats) {
  const groups = new Map();
  for (const s of stats) {
    if (!s.ok) continue;
    const k = `${s.variant} ${s.target}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, xs]) => {
    const [variant, target] = key.split(' ');
    const secs = xs.map((s) => s.ms / 1000);
    const tok = xs.filter((s) => s.tokens).map((s) => s.tokens.input + s.tokens.output);
    const out = xs.filter((s) => s.tokens).map((s) => s.tokens.output);
    return {
      variant, target, n: xs.length,
      seconds: { mean: +mean(secs).toFixed(1), sd: +sd(secs).toFixed(1) },
      tokens: tok.length ? { mean: Math.round(mean(tok)), sd: Math.round(sd(tok)), output_mean: Math.round(mean(out)), n: tok.length } : null,
    };
  });
}

export async function sample(t, text, timeout, rm = rmSync) {
  const receipt = (raw, request = null) => provenance(fileURLToPath(import.meta.url), t, text, { raw, configHash: t.configHash, version: t.cliVersion,
    transport: t.microTransport === 'openai' ? 'openai-chat-completions' : `${t.harness}-cli`, request });
  if (t.microTransport === 'openai') {
    try {
      const r = await chat(t, text, timeout);
      return { ok: true, text: r.text, raw: r.raw, tokens: { input: r.usage.input_tokens, output: r.usage.output_tokens }, provenance: receipt(r.raw, r.request) };
    } catch (e) { return { ok: false, text: `ERROR ${e.message}`, raw: e.raw ?? '', tokens: null, provenance: receipt(e.raw, e.request) }; }
  }
  const ws = mkdtempSync(join(tmpdir(), 'micro-'));
  try {
    if (t.harness === 'claude') {
      const a = ['-p', '--no-session-persistence', '--setting-sources', 'project,local', '--max-turns', '1', '--tools', '', '--output-format', 'json'];
      if (t.model) a.push('--model', t.model);
      if (t.effort) a.push('--effort', t.effort);
      const r = await runProcess([...t.bin, ...a], { cwd: ws, stdin: text, timeout });
      if (r.code !== 0 || r.outCut || sessionFailure(r.out, 'claude')) return { ok: false, text: `ERROR ${r.timedOut ? 'timeout' : sessionFailure(r.out, 'claude') ?? r.code}: ${r.err.slice(-2000)}`, raw: r.out, tokens: null, provenance: receipt(r.out) };
      const p = parseClaudeJson(r.out);
      return { ok: true, text: p.text, tokens: p.tokens, raw: r.out, provenance: receipt(r.out) };
    }
    const home = join(ws, 'codex-home');
    mkdirSync(home);
    const cfg = join(CODEX_SRC, 'config.toml');
    writeFileSync(join(home, 'config.toml'), codexConfig(existsSync(cfg) ? readFileSync(cfg, 'utf8') : '', t.windows_sandbox));
    const authFile = join(CODEX_SRC, 'auth.json');
    const auth = existsSync(authFile) ? readFileSync(authFile, 'utf8') : null;
    if (auth != null) writeFileSync(join(home, 'auth.json'), auth);
    const outFile = join(ws, 'last.txt');
    const r = await runProcess([...t.bin, ...codexArgs(t, ws, outFile)], { cwd: ws, stdin: text, env: { CODEX_HOME: home }, timeout });
    if (writeBackAuth(CODEX_SRC, home, auth)) log('Codex refreshed its login during a sample; the new tokens were written back to your Codex home.');
    return existsSync(outFile) && r.code === 0 && !r.outCut && !sessionFailure(r.out, 'codex')
      ? { ok: true, text: readFileSync(outFile, 'utf8'), tokens: parseCodexUsage(r.out), raw: r.out, provenance: receipt(r.out) }
      : { ok: false, text: `ERROR ${r.timedOut ? 'timeout' : sessionFailure(r.out, 'codex') ?? r.code}: ${r.err.slice(-2000)}`, tokens: null, raw: r.out, provenance: receipt(r.out) };
  } finally {
    removeWorkspace(ws, rm);
  }
}

// ---------- args ----------

const VALUE_FLAGS = new Set(['--jobs', '--timeout', '--targets']);

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) opts[a] = argv[++i];
    else if (a.startsWith('--')) opts[a] = true;
    else pos.push(a);
  }
  return { pos, opts };
}

// ---------- selftest ----------

async function selftest() {
  const failures = [];
  const check = (name, ok) => { if (!ok) failures.push(name); log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
  const root = mkdtempSync(join(tmpdir(), 'micro-selftest-'));
  try {
    const config = { targets: [
      { id: 'claude', harness: 'claude', enabled: true, command: ['fake-claude'] },
      { id: 'openai', harness: 'codex', enabled: true, windows_sandbox: 'unelevated', command: ['fake-codex'] },
      { id: 'off', harness: 'codex', enabled: false, command: ['fake-codex'] },
      { id: 'local', harness: 'opencode', enabled: true },
    ] };
    const noBin = () => null;

    const def = selectTargets(config, null, noBin);
    check('default targets are the enabled claude/codex ones', def.live.map((t) => t.id).join() === 'claude,openai' && def.skipped.map((s) => s.id).join() === 'off');
    const named = selectTargets(config, ['claude', 'off'], noBin);
    check('a named disabled target is skipped, not run', named.live.map((t) => t.id).join() === 'claude' && named.skipped[0]?.why.includes('disabled'));
    const missing = selectTargets({ targets: [{ id: 'claude', harness: 'claude', enabled: true }] }, null, noBin);
    check('a harness missing from PATH is skipped', !missing.live.length && missing.skipped[0]?.why.includes('not found'));
    let threw = '';
    try { selectTargets(config, ['local'], noBin); } catch (e) { threw = e.message; }
    check('an unsupported harness is an error', threw.includes('not supported'));
    threw = '';
    try { selectTargets(config, ['nope'], noBin); } catch (e) { threw = e.message; }
    check('an unknown target is an error', threw.includes('no target named'));

    const dir = join(root, 'planted');
    mkdirSync(dir);
    writeFileSync(join(dir, 'task.md'), 'Fix the bug.\n');
    writeFileSync(join(dir, 'variant-none.md'), '');
    writeFileSync(join(dir, 'variant-old.md'), 'Write the test first.\n');
    writeFileSync(join(dir, 'notes.md'), 'not a variant\n');
    const jobs = planJobs(dir, 2, def.live);
    check('job list: variants x targets x reps, sorted', jobs.map((j) => j.file).join() === 'variant-none.claude.1.md,variant-none.claude.2.md,variant-none.openai.1.md,variant-none.openai.2.md,variant-old.claude.1.md,variant-old.claude.2.md,variant-old.openai.1.md,variant-old.openai.2.md');
    check('empty variant is the no-guidance control (task only)', jobs[0].control && jobs[0].text === 'Fix the bug.\n');
    const guided = jobs.find((j) => j.variant === 'variant-old');
    check('guidance is wrapped as the loaded skill, task after it', !guided.control && guided.text.startsWith('You are working with the following skill loaded') && guided.text.includes('<skill>\nWrite the test first.\n\n</skill>') && guided.text.endsWith('Fix the bug.\n'));

    const src = 'model = "gpt-x"\nmodel_reasoning_effort = "high"\nmcp_servers.serena.command = "serena"\nwindows.sandbox = "elevated"\n\n[mcp_servers.serena]\ncommand = "serena"\n[windows]\nsandbox = "elevated"\n';
    const cfg = codexConfig(src, 'unelevated');
    check('codex config keeps top-level keys only, plus the target sandbox', cfg === 'model = "gpt-x"\nmodel_reasoning_effort = "high"\n\n[windows]\nsandbox = "unelevated"\n');
    check('codex config without windows_sandbox has no [windows] table', codexConfig(src, undefined) === 'model = "gpt-x"\nmodel_reasoning_effort = "high"\n');

    const real = join(root, 'real');
    const home = join(root, 'home');
    mkdirSync(real);
    mkdirSync(home);
    writeFileSync(join(real, 'auth.json'), 'old');
    writeFileSync(join(home, 'auth.json'), 'new');
    check('refreshed tokens are written back when the real auth.json is untouched', writeBackAuth(real, home, 'old') && readFileSync(join(real, 'auth.json'), 'utf8') === 'new');
    writeFileSync(join(real, 'auth.json'), 'changed-elsewhere');
    writeFileSync(join(home, 'auth.json'), 'newer');
    check('tokens are not written back when the real auth.json changed', !writeBackAuth(real, home, 'old') && readFileSync(join(real, 'auth.json'), 'utf8') === 'changed-elsewhere');

    const ca = codexArgs({ model: 'gpt-x' }, 'ws', 'out.txt').join(' ');
    check('codex samples get no shell and never escalate', ca.includes('--disable shell_tool') && ca.includes('--disable unified_exec') && ca.includes('-s read-only') && ca.includes('approval_policy="never"') && ca.endsWith('-m gpt-x -'));

    const eperm = () => { throw Object.assign(new Error('EPERM, Permission denied'), { code: 'EPERM' }); };
    const stuck = join(root, 'stuck');
    mkdirSync(stuck);
    let kept;
    try { kept = removeWorkspace(stuck, eperm); } catch { kept = 'threw'; }
    check('a workspace that will not delete is a warning, not a crash', kept === false && existsSync(stuck));
    const ro = join(root, 'ro');
    mkdirSync(join(ro, 'sub'), { recursive: true });
    writeFileSync(join(ro, 'sub', 'f'), 'x');
    chmodSync(join(ro, 'sub', 'f'), 0o444);
    let calls = 0;
    const onceBusy = (p, o) => { if (!calls++) eperm(); rmSync(p, o); };
    check('a failed delete clears read-only files and retries', removeWorkspace(ro, onceBusy) === true && calls === 2 && !existsSync(ro));
    const fake = join(root, 'fake-claude.mjs');
    writeFileSync(fake, "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('the reply'));\n");
    const left = [];
    const r = await sample({ harness: 'claude', bin: [process.execPath, fake] }, 'hi', 30000, (p) => { left.push(p); eperm(); });
    check('a sample whose workspace will not delete still returns its reply', r.ok && r.text === 'the reply' && left.length === 2);
    for (const p of new Set(left)) rmSync(p, { recursive: true, force: true });

    const cj = parseClaudeJson(JSON.stringify({ type: 'result', result: 'hi', usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 } }));
    check('claude json: reply from result, input counts cached tokens', cj.text === 'hi' && cj.tokens.input === 100 && cj.tokens.output === 5);
    check('claude plain text: kept as the reply, no tokens', parseClaudeJson('just text').text === 'just text' && parseClaudeJson('just text').tokens === null);
    const cx = parseCodexUsage(['{"type":"thread.started"}', 'noise', '{"type":"turn.completed","usage":{"input_tokens":300,"cached_input_tokens":200,"output_tokens":40}}', '{"type":"item.completed","usage":{"input_tokens":999}}'].join('\n'));
    check('codex jsonl: usage summed from turn-completion events only', cx.input === 300 && cx.output === 40);
    check('codex without usage events: no tokens', parseCodexUsage('{"type":"item.completed"}\n') === null);
    const sum = summarise([
      { variant: 'variant-a', target: 'claude', ok: true, ms: 1000, tokens: { input: 90, output: 10 } },
      { variant: 'variant-a', target: 'claude', ok: true, ms: 3000, tokens: { input: 290, output: 10 } },
      { variant: 'variant-a', target: 'claude', ok: false, ms: 9000, tokens: null },
      { variant: 'variant-a', target: 'openai', ok: true, ms: 2000, tokens: null },
    ]);
    check('cost summary: failed samples left out, mean and spread per arm', sum.length === 2 && sum[0].n === 2 && sum[0].seconds.mean === 2 && sum[0].seconds.sd === 1.4 && sum[0].tokens.mean === 200 && sum[0].tokens.output_mean === 10);
    check('cost summary: tokens null where the harness reported none', sum[1].tokens === null && sum[1].seconds.mean === 2);

    const self = fileURLToPath(import.meta.url);
    const noTask = join(root, 'no-task');
    mkdirSync(noTask);
    writeFileSync(join(noTask, 'variant-a.md'), 'x');
    const r1 = spawnSync(process.execPath, [self, noTask, '1', 'claude'], { encoding: 'utf8' });
    check('missing task.md exits 2', r1.status === 2 && /task\.md not found/.test(r1.stdout));
    const r2 = spawnSync(process.execPath, [self, dir, '0'], { encoding: 'utf8' });
    check('reps below 1 exits 2', r2.status === 2);
    const r3 = spawnSync(process.execPath, [self], { encoding: 'utf8' });
    check('no test dir exits 2', r3.status === 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  log(`micro selftest: ${failures.length} failure(s)`);
  finish({ ok: !failures.length, mode: 'selftest', failures }, failures.length ? 1 : 0);
}

// ---------- main ----------

async function main() {
  const { pos, opts } = parseArgs(process.argv.slice(2));
  if (opts['--selftest']) return selftest();
  const fail = (error) => finish({ ok: false, error }, 2);
  const [dirArg, repsArg = '5', idsArg] = pos;
  if (!dirArg) fail('usage: node micro.mjs <test-dir> [reps=5] [targets] [--jobs N] [--timeout s] [--targets file]');
  const reps = Number(repsArg);
  if (!Number.isInteger(reps) || reps < 1) fail(`reps must be a whole number of at least 1, got ${repsArg}`);
  const jobsN = Math.max(1, Number(opts['--jobs'] ?? 6));
  const timeout = Number(opts['--timeout'] ?? 600) * 1000;
  const dir = resolve(dirArg);
  let config;
  try {
    config = JSON.parse(readFileSync(opts['--targets'] ?? join(EVALS_DIR, 'targets.json'), 'utf8'));
  } catch (e) {
    fail(`targets.json: ${e.message}`);
  }
  if (opts['--plan']) {
    const ids = idsArg ? idsArg.split(',').filter(Boolean) : null;
    const planned = config.targets.filter((t) => !ids || ids.includes(t.id));
    if (!planned.length || (ids && ids.some((id) => !planned.some((t) => t.id === id)))) fail('no matching configured planning targets');
    const jobs = planJobs(dir, reps, planned);
    finish({ ok: true, mode: 'plan', modelsExecuted: false, samples: jobs.length, targets: planned.map((t) => ({ id: t.id, enabled: t.enabled === true })), variants: [...new Set(jobs.map((job) => job.variant))] }, 0);
  }
  let jobs;
  let live;
  try {
    if (!existsSync(join(dir, 'task.md'))) throw new Error(`${join(dir, 'task.md')} not found`);
    const sel = selectTargets(config, idsArg ? idsArg.split(',').filter(Boolean) : null);
    for (const s of sel.skipped) log(`skipping ${s.id}: ${s.why}`);
    live = sel.live;
    for (const t of live) { t.configHash = sha256(config); t.cliVersion = await cliVersion(t); }
    if (!live.length) throw new Error('no runnable targets');
    jobs = planJobs(dir, reps, live);
  } catch (e) {
    fail(e.message);
  }
  if (live.some((t) => t.harness === 'claude')) log('Claude samples use --setting-sources project,local and no tools; ~/.claude/CLAUDE.md may still reach them.');
  mkdirSync(join(dir, 'out'), { recursive: true });
  const byId = Object.fromEntries(live.map((t) => [t.id, t]));
  const errors = [];
  const stats = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const j = jobs[next++];
      const t0 = Date.now();
      // One sample's failure is that sample's ERROR file, never the end of the run.
      const r = await sample(byId[j.target], j.text, timeout).catch((e) => ({ ok: false, text: `ERROR ${e.code ?? 'exception'}: ${e.message}`, tokens: null }));
      stats.push({ file: j.file, variant: j.variant, target: j.target, rep: j.rep, ok: r.ok, ms: Date.now() - t0, tokens: r.tokens ?? null,
        provenance: r.provenance ?? provenance(fileURLToPath(import.meta.url), byId[j.target], j.text, { configHash: sha256(config), version: byId[j.target].cliVersion }) });
      writeFileSync(join(dir, 'out', j.file), r.text);
      writeFileSync(join(dir, 'out', j.file.replace(/\.md$/, '.jsonl')), r.raw ?? '');
      if (!r.ok) errors.push(j.file);
      log(`${j.variant} ${j.target} #${j.rep} ${r.ok ? 'done' : 'FAILED'}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobsN, jobs.length) }, worker));
  // out/stats.json keeps earlier runs' rows for files this run didn't write, so a later variant can be added alone.
  const statsFile = join(dir, 'out', 'stats.json');
  let earlier = [];
  try { earlier = JSON.parse(readFileSync(statsFile, 'utf8')); } catch {}
  const written = new Set(stats.map((s) => s.file));
  const all = [...(Array.isArray(earlier) ? earlier : []).filter((s) => !written.has(s.file)), ...stats].sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(statsFile, JSON.stringify(all, null, 2) + '\n');
  const cost = summarise(all);
  for (const c of cost) log(`cost ${c.variant} ${c.target}: ${c.seconds.mean}s ±${c.seconds.sd}${c.tokens ? `, ${c.tokens.mean} tokens ±${c.tokens.sd} (output ${c.tokens.output_mean})` : ', tokens not reported'} over ${c.n}`);
  finish({ ok: !errors.length, dir, out: join(dir, 'out'), samples: jobs.length, targets: live.map((t) => t.id), errors, cost }, errors.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
