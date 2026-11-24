#!/usr/bin/env node
// Locate the system skill or delegate to its unmodified CLI. Never log credentials.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const home = homedir();
const root = resolve(process.env.IMAGEGEN_SKILL_ROOT || join(process.env.CODEX_HOME || join(home, '.codex'), 'skills', '.system', 'imagegen'));
const skill = join(root, 'SKILL.md');
const cli = join(root, 'scripts', 'image_gen.py');
const args = process.argv.slice(2);
const fail = (message) => { console.error(`imagegen: ${message}`); process.exit(2); };
if (!existsSync(skill) || !existsSync(cli)) fail(`Incomplete system skill at ${root}. Set IMAGEGEN_SKILL_ROOT to its installed directory.`);
if (args[0] === '--locate') {
  console.log(JSON.stringify({ skill, cli }));
  process.exit(0);
}
const candidates = process.env.IMAGEGEN_PYTHON ? [process.env.IMAGEGEN_PYTHON] : [
  join(home, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3'),
  'python3', 'python',
];
const python = candidates.find((p) => spawnSync(p, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).status === 0);
if (!python) fail('Python 3.10+ unavailable. Set IMAGEGEN_PYTHON to a Python executable, then rerun --doctor.');
if (args[0] === '--selftest') {
  const tmp = mkdtempSync(join(tmpdir(), 'imagegen-helper-'));
  const problems = [];
  try {
    mkdirSync(join(tmp, 'scripts'));
    writeFileSync(join(tmp, 'SKILL.md'), '# fixture');
    writeFileSync(join(tmp, 'scripts', 'image_gen.py'), 'import json, sys\nprint(json.dumps(sys.argv[1:]))\nsys.exit(7 if "exit-seven" in sys.argv else 0)\n');
    const env = { ...process.env, IMAGEGEN_SKILL_ROOT: tmp, IMAGEGEN_PYTHON: python, OPENAI_API_KEY: '' };
    const run = (a, override = {}) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...a], { env: { ...env, ...override }, encoding: 'utf8', windowsHide: true });
    if (run(['--locate']).status !== 0) problems.push('locate failed');
    if (run(['--locate'], { IMAGEGEN_SKILL_ROOT: join(tmp, 'missing') }).status !== 2) problems.push('missing skill accepted');
    if (run(['generate', '--prompt', 'test']).status !== 2) problems.push('live request without key accepted');
    const dry = run(['generate', '--prompt', 'spaces and $() literal', '--dry-run']);
    if (dry.status !== 0 || JSON.parse(dry.stdout)[2] !== 'spaces and $() literal') problems.push('dry-run or argument preservation failed');
    const child = run(['generate', 'exit-seven'], { OPENAI_API_KEY: 'fixture-secret-do-not-print' });
    if (child.status !== 7) problems.push('child exit status lost');
    const doctor = run(['--doctor']);
    if (doctor.status !== 1 || JSON.parse(doctor.stdout).keySet !== false) problems.push('doctor accepted missing key');
    if ((child.stdout + child.stderr + doctor.stdout + doctor.stderr).includes('fixture-secret-do-not-print')) problems.push('credential exposed');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ status: problems.length ? 'failures' : 'ok', problems }));
  process.exit(problems.length ? 1 : 0);
}
if (args[0] === '--doctor') {
  const dependencies = spawnSync(python, ['-c', 'import openai, PIL'], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).status === 0;
  const keySet = Boolean(process.env.OPENAI_API_KEY);
  console.log(JSON.stringify({ skill, cli, python, dependencies, keySet, ready: dependencies && keySet }));
  if (!dependencies) console.error('imagegen: Run this helper with --setup to install openai and pillow after choosing CLI fallback.');
  if (!keySet) console.error('imagegen: Set OPENAI_API_KEY locally before a live API call. Dry-run remains available.');
  process.exit(dependencies && keySet ? 0 : 1);
}
if (!args.length || args[0] === '--help') {
  console.log(JSON.stringify({ usage: 'node imagegen.mjs --locate|--doctor|--setup|generate|edit|generate-batch [upstream arguments]', python, cli }));
  process.exit(0);
}
if (!['--setup', 'generate', 'edit', 'generate-batch'].includes(args[0])) fail(`Unknown command: ${args[0]}`);
if (args[0] !== '--setup' && !args.includes('--dry-run') && !args.includes('--help') && !process.env.OPENAI_API_KEY) fail('Set OPENAI_API_KEY locally before a live API call; use --dry-run to check the payload without a key.');
const childArgs = args[0] === '--setup' ? ['-m', 'pip', 'install', 'openai', 'pillow'] : ['-X', 'utf8', cli, ...args];
const result = spawnSync(python, childArgs, { stdio: 'inherit', windowsHide: true });
if (result.error) fail(`Could not start Python: ${result.error.message}`);
process.exit(result.status ?? 2);
