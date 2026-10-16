// Additive receipts for new evaluations. Unknown response metadata stays unknown;
// requested effort is not proof that a provider honored it. Never serialize env/auth.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './proc.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));

export const sha256 = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function endpoint(value) {
  if (!value) return null;
  const url = new URL(value);
  url.username = ''; url.password = ''; url.search = ''; url.hash = '';
  return url.href.replace(/\/$/, '');
}

export function observed(raw = '') {
  const models = new Set();
  const efforts = new Set();
  const events = [];
  try { events.push(JSON.parse(raw)); } catch { /* JSONL is parsed below. */ }
  if (!events.length) for (const line of raw.split(/\r?\n/)) {
    try { events.push(JSON.parse(line)); } catch { /* Non-event diagnostic line. */ }
  }
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    for (const model of [e.model, e.message?.model, e.info?.modelID, e.part?.modelID, ...Object.keys(e.modelUsage ?? {})]) {
      if (typeof model === 'string' && model.trim()) models.add(model);
    }
    for (const effort of [e.reasoning_effort, e.reasoning?.effort]) if (typeof effort === 'string' && effort.trim()) efforts.add(effort);
  }
  return { models: [...models].sort(), efforts: [...efforts].sort(), source: models.size || efforts.size ? 'response metadata' : 'not reported' };
}

const versions = new Map();
export async function cliVersion(target) {
  if (!target.bin || target.command) return null;
  const key = JSON.stringify(target.bin);
  if (!versions.has(key)) versions.set(key, runProcess([...target.bin, '--version'], { timeout: 10_000 }).then(r => r.code === 0 ? r.out.trim().split(/\r?\n/)[0] || null : null));
  return versions.get(key);
}

export function provenance(runner, target, input, { raw = '', configHash = null, version = null, transport, request = null } = {}) {
  const code = [runner, ...readdirSync(LIB_DIR).filter(f => f.endsWith('.mjs')).sort().map(f => join(LIB_DIR, f))];
  const configured = {
    harness: target.harness ?? target.kind ?? null,
    model: target.apiModel ?? target.model ?? null,
    effort: target.effort ?? null,
    endpoint: endpoint(target.baseURL ?? target.env?.JEV_API_BASE_URL),
  };
  return {
    schemaVersion: 1, at: new Date().toISOString(), configured,
    transport: transport ?? ({ openai: 'openai-chat-completions', mcp: 'mcp-stdio', claude: 'claude-cli', codex: 'codex-cli', opencode: 'opencode-cli' })[target.harness ?? target.kind] ?? 'in-process',
    request,
    observed: observed(raw), inputSha256: sha256(input),
    configSha256: configHash ?? sha256(target),
    runner: { name: basename(runner), sha256: sha256(code.map(f => [basename(f), sha256(readFileSync(f))])), node: process.version, cliVersion: version },
  };
}
