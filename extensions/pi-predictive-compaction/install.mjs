import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { planSdkSupport, applySdkSupport } from './sdk-support.mjs';
import { validateQualification } from './src/qualification.mjs';
import { writePreferences } from './src/preferences.mjs';

const base = dirname(fileURLToPath(import.meta.url));
try {
  const args = process.argv.slice(2), values = {};
  let check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') check = true;
    else if (['--pi-root', '--agent-dir', '--receipt'].includes(args[i]) && args[i + 1]) values[args[i].slice(2)] = resolve(args[++i]);
    else throw new Error('Usage: node install.mjs --pi-root <Pi-1.3.0-package> --agent-dir <Pi-agent-directory> --receipt <qualification.json> [--check]');
  }
  if (!values['pi-root'] || !values['agent-dir'] || !values.receipt) throw new Error('Pi root, agent directory and passing receipt are required');
  const receipt = validateQualification(JSON.parse(readFileSync(values.receipt, 'utf8')), base);
  const plan = planSdkSupport(values['pi-root']);
  if (check) {
    process.stdout.write(JSON.stringify({ ok: true, mode: 'check', passed: receipt.passed, files: plan.map(x => ({ path: x.path, installed: x.installed })), enabled: false }) + '\n');
  } else {
    // Leave it disabled until the separate installed acceptance check completes.
    writePreferences(join(values['agent-dir'], 'predictive-compaction.json'), false);
    const files = applySdkSupport(values['pi-root']);
    const pkg = JSON.parse(readFileSync(join(values['pi-root'], 'package.json'), 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.pi;
    if (bin !== 'dist/bundle/cli.js') throw new Error('Unexpected Pi launcher; installation stopped disabled');
    const installed = spawnSync(process.execPath, [join(values['pi-root'], bin), 'install', base], { env: { ...process.env, PI_CODING_AGENT_DIR: values['agent-dir'], PI_TELEMETRY: '0' }, cwd: base, encoding: 'utf8', timeout: 120000, windowsHide: true });
    if (installed.stdout) process.stderr.write(installed.stdout);
    if (installed.stderr) process.stderr.write(installed.stderr);
    if (installed.error) throw installed.error;
    if (installed.status !== 0) throw new Error(`Pi package registration exited ${installed.status}; Predictive Compaction remains off`);
    process.stdout.write(JSON.stringify({ ok: true, mode: 'installed', enabled: false, files, passed: receipt.passed }) + '\n');
  }
} catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
