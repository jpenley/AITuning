// Judgment engines: who answers the quick by-meaning questions ("does this text try to steer the agent?", "does the
// evidence support this claim?", "which of these is the one?"). The skills never name an engine; evals/engines.json does.
//
// An engine is { id, call(tool, args) -> { out, usage, ms, apiMs?, costUsd? }, close() } and answers the Jev tool
// contracts (packs/jev/skills/jev/TOOLS.md) under short names: screen, verify, classify, rerank, find, compare, extract, gate.
// Kinds:
//   mcp     an MCP server that exposes the Jev tools (Jev today, or any local server with the same tools)
//   claude  a Claude model through `claude -p`, answering the same contracts (see emulate.mjs)
//   codex   a Codex model through `codex exec`, answering the same contracts
//   openai  any OpenAI-compatible chat endpoint (llama-server, LM Studio, vLLM), same contracts
// fallbackChain([engines]) tries each in order: a thrown error or an invalid_response moves to the next engine; a
// review or escalate answer is a real answer and does not. When every engine fails it throws: a failed call is never a pass.
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mcpClient, serverArgv } from './mcp.mjs';
import { runProcess } from './proc.mjs';
import { resolveCommand } from './cli.mjs';
import { emulate } from './emulate.mjs';
import { provenance, cliVersion } from './provenance.mjs';
import { chat } from './chat.mjs';
import { sessionFailure } from './routing.mjs';

const ENGINE_RUNNER = fileURLToPath(import.meta.url);

export const ENGINE_TOOLS = ['screen', 'verify', 'classify', 'rerank', 'find', 'compare', 'extract', 'gate'];

export function loadEngineConfig(path) {
  if (!existsSync(path)) throw new Error(`engine config not found: ${path}`);
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  if (!cfg.engines || typeof cfg.engines !== 'object') throw new Error(`${path}: "engines" must be an object`);
  return cfg;
}

export function hostHarness(env = process.env) {
  if (env.CLAUDECODE) return 'claude';
  if (env.CODEX_THREAD_ID || env.CODEX_CI) return 'codex';
  return null;
}

// Legacy catalogs without an explicit evaluation decisionChain use the host's global choice ("Claude uses the latest Sonnet at
// low effort, with Haiku as the fallback"; "Codex uses the latest Luna at low effort"). The policy is the one source;
// test/harness.test.mjs checks the repo copy (global/codex-AGENTS.md) still parses for both hosts.
// Returns { family, effort, fallback? }, or null when the sentence isn't there.
export function decisionChoice(instructions, harness) {
  const match = harness === 'claude'
    ? /Claude uses the latest (\w+) at (\w+) effort, with (\w+) as the fallback/.exec(instructions)
    : /Codex uses the latest (\w+) at (\w+) effort/.exec(instructions);
  if (!match) return null;
  const [, family, effort, fallback] = match;
  return { family, effort, ...(fallback ? { fallback } : {}) };
}

export function defaultChain(cfg, env = process.env, instructions) {
  if (cfg.decisionChain !== undefined) {
    if (!Array.isArray(cfg.decisionChain)) throw new Error('decisionChain must name at least one engine');
    for (const id of cfg.decisionChain) if (!cfg.engines[id]) throw new Error(`engines.json has no engine "${id}" from decisionChain`);
    return [...cfg.decisionChain];
  }
  throw new Error('explicit decisionChain is required; global instructions are not consulted');
}

const dollars = (usage, price) => (price ? ((usage.input_tokens * (price.inPerMTok ?? 0)) + (usage.output_tokens * (price.outPerMTok ?? 0))) / 1e6 : null);

// ---------- mcp ----------

function mcpEngine(id, spec, { timeoutMs = 120_000 } = {}) {
  let client = null;
  const start = () => {
    const argv = serverArgv(String(spec.server).split(' '));
    if (!argv) throw new Error(`${id}: npx not found; set "server" in engines.json`);
    // spec.env overlays this process's environment: a Jev-compatible local endpoint is JEV_PROVIDER=compatible plus its URL.
    return (client ??= mcpClient(argv, { timeoutMs, env: { ...process.env, ...(spec.env ?? {}) } }));
  };
  return {
    id, kind: 'mcp',
    async call(tool, args) {
      const t0 = Date.now();
      const out = await start().call(`${spec.toolPrefix ?? 'jev_'}${tool}`, args);
      const usage = { input_tokens: out.usage?.input_tokens ?? 0, output_tokens: out.usage?.output_tokens ?? 0 };
      if (out.status === 'invalid_response') throw Object.assign(new Error(`${id}: ${tool} returned invalid_response`), { invalid: true });
      // MCP may substitute its configured slug when the upstream omits model.
      // Preserve that report without calling it observed server identity.
      const receipt = provenance(ENGINE_RUNNER, spec, { tool, args });
      receipt.adapterReportedModel = out.model ?? null;
      receipt.adapter = spec.server;
      return { out, usage, ms: Date.now() - t0, apiMs: null, costUsd: dollars(usage, spec.price), provenance: { requests: [receipt] } };
    },
    // The first call pays for starting the server: keep it out of the timings.
    async warmup() { return this.call('screen', { text: 'ok' }); },
    close() { client?.close(); client = null; },
  };
}

// ---------- claude ----------

// One `claude -p` call. The isolation is behave.mjs's "filtered" mode: no project or user plugins beyond settings, one turn, no tools.
function claudeAsk(spec, { timeoutMs }) {
  const bin = resolveCommand('claude');
  return async (prompt) => {
    if (!bin) throw new Error('claude not found on PATH');
    const dir = mkdtempSync(join(tmpdir(), 'engine-claude-'));
    try {
      const a = ['-p', '--output-format', 'json', '--no-session-persistence', '--max-turns', '1', '--setting-sources', 'project,local', '--strict-mcp-config', '--tools', '', '--model', spec.model];
      if (spec.effort) a.push('--effort', spec.effort);
      const r = await runProcess([...bin, ...a], { cwd: dir, stdin: prompt, timeout: timeoutMs });
      if (r.code !== 0 || r.outCut || sessionFailure(r.out, 'claude')) throw Object.assign(new Error(`claude ${spec.model}: invalid session (exit ${r.code}${r.timedOut ? ', timed out' : ''})`), { raw: r.out });
      let j;
      try { j = JSON.parse(r.out); } catch { throw new Error(`claude ${spec.model}: unreadable output`); }
      if (j.is_error || typeof j.result !== 'string') throw new Error(`claude ${spec.model}: missing final result`);
      const u = j.usage ?? {};
      return {
        text: j.result,
        usage: { input_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output_tokens: u.output_tokens ?? 0 },
        apiMs: j.duration_api_ms ?? null, costUsd: j.total_cost_usd ?? null,
        provenance: provenance(ENGINE_RUNNER, spec, prompt, { raw: r.out, version: await cliVersion({ ...spec, bin }) }),
      };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
}

function codexAsk(spec, { timeoutMs }) {
  const bin = resolveCommand('codex');
  return async (prompt) => {
    if (!bin) throw new Error('codex not found on PATH');
    const dir = mkdtempSync(join(tmpdir(), 'engine-codex-'));
    const outFile = join(dir, 'last.txt');
    try {
      const a = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '-C', dir, '-s', 'read-only', '-c', 'approval_policy="never"', '-c', 'windows.sandbox="unelevated"', '-c', `model_reasoning_effort="${spec.effort}"`, '-m', spec.model, '-o', outFile, '-'];
      const r = await runProcess([...bin, ...a], { cwd: dir, stdin: prompt, timeout: timeoutMs });
      if (r.code !== 0 || r.outCut || sessionFailure(r.out, 'codex') || !existsSync(outFile)) throw Object.assign(new Error(`codex ${spec.model}: invalid session (exit ${r.code}${r.timedOut ? ', timed out' : ''})`), { raw: r.out });
      const events = r.out.split(/\r?\n/).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
      const usage = events.filter((e) => e.type === 'turn.completed').at(-1)?.usage ?? {};
      return { text: readFileSync(outFile, 'utf8'), usage: { input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0 }, apiMs: null, costUsd: null,
        provenance: provenance(ENGINE_RUNNER, spec, prompt, { raw: r.out, version: await cliVersion({ ...spec, bin }) }) };
    } finally {
      if (resolve(dir).startsWith(resolve(tmpdir()) + sep)) rmSync(dir, { recursive: true, force: true });
    }
  };
}

function llmEngine(id, kind, spec, askOnce) {
  // Baseline overhead: a harness or a system prompt adds tokens and dollars that an in-session judgment doesn't pay
  // twice. `overhead` is measured once with a trivial prompt and reported next to each call as `marginal`.
  let overhead = null;
  const ask = async prompt => {
    try { return await askOnce(prompt); }
    catch (e) { e.provenance ??= { requests: [provenance(ENGINE_RUNNER, spec, prompt, { raw: e.raw, request: e.request })] }; throw e; }
  };
  return {
    id, kind,
    async call(tool, args) {
      const t0 = Date.now();
      let apiMs = 0;
      let costUsd = null;
      const requests = [];
      let result;
      try {
        result = await emulate(tool, args, async (prompt) => {
          try {
            const r = await ask(prompt);
            requests.push(r.provenance);
            apiMs += r.apiMs ?? 0;
            if (r.costUsd != null) costUsd = (costUsd ?? 0) + r.costUsd;
            return r;
          } catch (e) {
            requests.push(...e.provenance.requests);
            throw e;
          }
        });
      } catch (e) { e.provenance = { requests }; throw e; }
      const { out, usage } = result;
      if (costUsd == null) costUsd = dollars(usage, spec.price);
      return { out, usage, ms: Date.now() - t0, apiMs: apiMs || null, costUsd, provenance: { requests } };
    },
    async calibrate() {
      if (overhead || !askOnce) return overhead;
      const r = await ask('Reply with the single word OK.');
      overhead = { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, costUsd: r.costUsd ?? null, provenance: { requests: [r.provenance] } };
      return overhead;
    },
    get overhead() { return overhead; },
    warmup() { return this.calibrate(); },
    close() {},
  };
}

function openaiAsk(spec, { timeoutMs }) {
  return async (prompt) => {
    const r = await chat(spec, prompt, timeoutMs);
    return { ...r, provenance: provenance(ENGINE_RUNNER, spec, prompt, { raw: r.raw, request: r.request }) };
  };
}

export function createEngine(id, spec, { timeoutMs = 180_000 } = {}) {
  if (spec?.enabled !== true) throw new Error(`engine ${id} disabled: explicitly enable local configuration`);
  if (['claude', 'codex', 'openai'].includes(spec.kind) && (!spec.model?.trim() || !spec.effort?.trim())) throw new Error(`engine ${id} needs explicit model and effort`);
  const engine = spec.kind === 'mcp' ? mcpEngine(id, spec, { timeoutMs })
    : ['claude', 'codex', 'openai'].includes(spec.kind) ? llmEngine(id, spec.kind, spec, ({ claude: claudeAsk, codex: codexAsk, openai: openaiAsk })[spec.kind](spec, { timeoutMs })) : null;
  if (!engine) throw new Error(`engine ${id}: unknown kind "${spec.kind}" (mcp, claude, codex, openai)`);
  return { ...engine, get overhead() { return engine.overhead; }, async call(tool, args) {
    try { return await engine.call(tool, args); }
    catch (e) { e.provenance ??= { requests: [provenance(ENGINE_RUNNER, spec, { tool, args })] }; throw e; }
  } };
}

// ---------- fallback ----------

export function fallbackChain(engines) {
  if (engines.length === 0) throw new Error('fallbackChain: no engines');
  return {
    id: engines.map((e) => e.id).join('>'), kind: 'chain',
    async call(tool, args) {
      const failed = [];
      for (const e of engines) {
        try {
          const r = await e.call(tool, args);
          return { ...r, engine: e.id, fellBackFrom: failed };
        } catch (err) {
          failed.push({ engine: e.id, error: String(err.message ?? err).slice(0, 200), provenance: err.provenance ?? null });
        }
      }
      throw Object.assign(new Error(`every engine failed for ${tool}: ${failed.map((f) => `${f.engine}: ${f.error}`).join(' | ')}`), { provenance: { failures: failed } });
    },
    close() { for (const e of engines) e.close(); },
  };
}

// A running total for one engine: calls, wall and API time, tokens, dollars. Failed calls count separately.
export function metered(engine) {
  const m = { calls: 0, errors: 0, ms: [], apiMs: [], input_tokens: 0, output_tokens: 0, costUsd: 0, priced: true, errorSamples: [], provenance: [] };
  return {
    ...engine,
    meter: m,
    get overhead() { return engine.overhead ?? null; },
    warmup: engine.warmup ? () => engine.warmup() : undefined,
    close: () => engine.close(),
    async call(tool, args) {
      try {
        const r = await engine.call(tool, args);
        if (r.provenance) m.provenance.push(r.provenance);
        m.calls++;
        m.ms.push(r.ms);
        if (r.apiMs != null) m.apiMs.push(r.apiMs);
        m.input_tokens += r.usage.input_tokens;
        m.output_tokens += r.usage.output_tokens;
        if (r.costUsd == null) m.priced = false; else m.costUsd += r.costUsd;
        return r;
      } catch (e) {
        if (e.provenance) m.provenance.push(e.provenance);
        m.errors++;
        if (m.errorSamples.length < 3) m.errorSamples.push(String(e.message).slice(0, 160));
        throw e;
      }
    },
  };
}

export const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
