import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../scripts/native-patch.mjs', import.meta.url));
function run(args) { return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }); }
// Break caught: a typo becomes an implicit mutation command.
test('source patcher rejects missing arguments and unknown flags', () => {
  for (const args of [[], ['--apply'], ['somewhere', '--force']]) {
    const p = run(args);
    assert.equal(p.status, 2);
    assert.match(p.stderr, /Usage:/u);
    assert.equal(p.stdout, '');
  }
});
// Break caught: a new Pi version is patched without a compatibility review.
test('source patcher refuses a different release without changing files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elicitation-patch-version-'));
  try {
    const dir = join(root, 'packages/coding-agent'); await mkdir(dir, { recursive: true });
    const path = join(dir, 'package.json');
    const original = JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '99.0.0' });
    await writeFile(path, original, 'utf8');
    const p = run([root, '--apply']);
    assert.equal(p.status, 1); assert.match(p.stderr, /Requires a Pi 1[.]3[.]0 source checkout/u);
    assert.equal(await readFile(path, 'utf8'), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});
