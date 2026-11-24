#!/usr/bin/env node
// Runs `claude plugin eval` on the core plugin (flowstate) with the cases in evals/plugin/.
// The core plugin's root is skills/, and `claude plugin eval` reads cases only from inside the plugin root, so this
// stages a copy of skills/ with the cases under its evals/ folder, in results/plugin-eval-root/ (ignored, replaced
// on each run), and writes the run's results to results/plugin-eval-<time>/ unless --output-dir is given.
// Usage: node plugin-eval.mjs [claude plugin eval options...]   e.g. --no-publish --runs 1 --case grill-fires
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { EVALS_DIR, SKILLS_DIR } from './lib/skills.mjs';
import { resolveCommand } from './lib/cli.mjs';
import { localConfig } from './lib/advanced-public-config.mjs';

const args = process.argv.slice(2);
if (args.some(a => a === '--publish' || a.startsWith('--publish=')) || args.includes('--run') && args.includes('--plan')) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'publish and conflicting modes are forbidden' }) + '\n'); process.exit(2);
}
if (!args.includes('--run')) {
  process.stdout.write(JSON.stringify({ ok: true, mode: 'plan', modelsExecuted: false, publish: false }) + '\n'); process.exit(0);
}
let spec;
try { spec = localConfig(args, join(EVALS_DIR, 'plugin-eval.local.json'), ['claude']).claude; }
catch (e) { process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + '\n'); process.exit(2); }
for (const name of ['--run', '--config']) { const i = args.indexOf(name); if (i >= 0) args.splice(i, name === '--config' ? 2 : 1); }
// Only documented sampling options pass through. Never let callers override the enabled model or publishing policy.
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--no-publish') continue;
  if (!['--runs', '--case', '--output-dir'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'unsupported plugin-eval option' }) + '\n'); process.exit(2);
  }
  i++;
}
args.push('--no-publish', '--model', spec.model, '--effort', spec.effort);
const claude = resolveCommand('claude');
if (!claude) {
  process.stderr.write('plugin-eval: claude not found on PATH\n');
  process.exit(2);
}
const results = join(EVALS_DIR, 'results');
const stage = join(results, 'plugin-eval-root');
rmSync(stage, { recursive: true, force: true });
cpSync(SKILLS_DIR, stage, { recursive: true });
cpSync(join(EVALS_DIR, 'plugin'), join(stage, 'evals', 'plugin'), { recursive: true });
if (!args.includes('--output-dir')) args.push('--output-dir', join(results, `plugin-eval-${new Date().toISOString().replace(/[:.]/g, '-')}`));
const r = spawnSync(claude[0], [...claude.slice(1), 'plugin', 'eval', stage, ...args], { stdio: 'inherit' });
if (r.error) process.stderr.write(`plugin-eval: ${r.error.message}\n`);
process.exit(r.status ?? 2);
