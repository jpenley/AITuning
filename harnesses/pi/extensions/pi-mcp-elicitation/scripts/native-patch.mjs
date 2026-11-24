#!/usr/bin/env node
// Opt-in source-checkout patcher. Never patches an installed Pi release.
import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const NL = String.fromCharCode(10);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function git(cwd, args) {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, shell: false });
  if (p.error) throw p.error;
  if (p.status !== 0) throw new Error(`git ${args[0]} failed: ${p.stderr.trim() || p.status}`);
  return p.stdout.trim();
}
async function digest(path) {
  try {
    const s = await lstat(path);
    if (!s.isFile() || s.isSymbolicLink()) throw new Error(`Refusing non-regular source file: ${path}`);
    return sha(await readFile(path));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2 || (args[1] !== undefined && args[1] !== '--apply') || args[0].startsWith('--')) {
    process.stderr.write('Usage: node native-patch.mjs PI_SOURCE_CHECKOUT [--apply]' + NL);
    process.exitCode = 2;
    return;
  }
  const root = await realpath(resolve(args[0]));
  const assets = resolve(dirname(fileURLToPath(import.meta.url)), '../upstream');
  const manifest = JSON.parse(await readFile(join(assets, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(root, 'packages/coding-agent/package.json'), 'utf8'));
  if (pkg.name !== '@earendil-works/pi-coding-agent') {
    throw new Error('Requires an @earendil-works/pi-coding-agent source checkout; no files changed');
  }
  if (pkg.version !== manifest.packageVersion) process.stderr.write(`native-patch: Pi ${pkg.version ?? 'unknown'} compatibility is unknown (qualified on ${manifest.packageVersion}); checking exact source hashes.${NL}`);
  const top = await realpath(git(root, ['rev-parse', '--show-toplevel']));
  if (top !== root) throw new Error('Requires the source checkout root; no files changed');
  const revision = git(root, ['rev-parse', 'HEAD']);
  if (revision !== manifest.baseRevision) process.stderr.write(`native-patch: Revision ${revision} compatibility is unknown (qualified on ${manifest.baseRevision}); checking exact source hashes.${NL}`);
  const patch = join(assets, manifest.patch);
  if (sha(await readFile(patch)) !== manifest.sha256) throw new Error('Patch digest mismatch; no files changed');
  const states = await Promise.all(manifest.files.map(async file => {
    if (file.path.startsWith('/') || file.path.includes('..') || file.path.includes(':')) throw new Error('Invalid patch path');
    return { ...file, current: await digest(join(root, file.path)) };
  }));
  const applied = states.every(file => file.current === file.afterSha256);
  if (!applied) {
    if (!states.every(file => file.current === file.beforeSha256)) throw new Error('Target files differ or patch is partial; no files changed');
    git(root, ['apply', '--check', patch]);
    if (args[1] === '--apply') git(root, ['apply', patch]);
  }
  const state = applied ? 'already-applied' : args[1] === '--apply' ? 'applied' : 'ready';
  process.stdout.write(JSON.stringify({ state, version: pkg.version, base: revision, qualifiedVersion: manifest.packageVersion, qualifiedBase: manifest.baseRevision,
    files: states.length, patchSha256: manifest.sha256, checkout: root }) + NL);
}
main().catch(error => {
  process.stderr.write(`native-patch: ${error.message}` + NL);
  process.exitCode = 1;
});
