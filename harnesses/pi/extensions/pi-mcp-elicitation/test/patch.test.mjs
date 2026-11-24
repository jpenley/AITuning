import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

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
// Version metadata must not prevent content-based compatibility checks.
test('source patcher warns on an unknown release before checking the checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elicitation-patch-version-'));
  try {
    const dir = join(root, 'packages/coding-agent'); await mkdir(dir, { recursive: true });
    const path = join(dir, 'package.json');
    const original = JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '99.0.0' });
    await writeFile(path, original, 'utf8');
    const p = run([root, '--apply']);
    assert.equal(p.status, 1); assert.match(p.stderr, /99[.]0[.]0 compatibility is unknown/u);
    assert.match(p.stderr, /git rev-parse failed|Requires the source checkout root/u);
    assert.equal(await readFile(path, 'utf8'), original);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});

const hash = value => createHash('sha256').update(value).digest('hex');
function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function patchFixture() {
  const root = await mkdtemp(join(tmpdir(), 'elicitation-content-'));
  const checkout = join(root, 'checkout'), tools = join(root, 'tools');
  await mkdir(join(checkout, 'packages/coding-agent'), { recursive: true });
  await mkdir(join(tools, 'scripts'), { recursive: true });
  await mkdir(join(tools, 'upstream'), { recursive: true });
  const before = 'original source\n', after = 'patched source\n';
  const patch = 'diff --git a/source.txt b/source.txt\n--- a/source.txt\n+++ b/source.txt\n@@ -1 +1 @@\n-original source\n+patched source\n';
  await writeFile(join(checkout, 'source.txt'), before);
  await writeFile(join(checkout, 'packages/coding-agent/package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '99.0.0' }));
  git(checkout, ['init']);
  git(checkout, ['config', 'core.autocrlf', 'false']);
  git(checkout, ['add', '.']);
  git(checkout, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture']);
  await writeFile(join(tools, 'scripts/native-patch.mjs'), await readFile(script));
  await writeFile(join(tools, 'upstream/test.patch'), patch);
  await writeFile(join(tools, 'upstream/manifest.json'), JSON.stringify({ packageVersion: '1.3.0', baseRevision: 'historical-qualified-base', tag: 'v1.3.0', patch: 'test.patch', sha256: hash(patch), files: [{ path: 'source.txt', beforeSha256: hash(before), afterSha256: hash(after) }] }));
  return { root, checkout, before, after, run: (...args) => spawnSync(process.execPath, [join(tools, 'scripts/native-patch.mjs'), checkout, ...args], { encoding: 'utf8' }) };
}

test('unknown release and revision accept exact compatible source, then reapply idempotently', async () => {
  const fixture = await patchFixture();
  try {
    const checked = fixture.run();
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(JSON.parse(checked.stdout).state, 'ready');
    assert.equal(JSON.parse(checked.stdout).version, '99.0.0');
    assert.match(checked.stderr, /compatibility is unknown/u);
    assert.equal(await readFile(join(fixture.checkout, 'source.txt'), 'utf8'), fixture.before);
    const applied = fixture.run('--apply');
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(await readFile(join(fixture.checkout, 'source.txt'), 'utf8'), fixture.after);
    assert.equal(JSON.parse(fixture.run('--apply').stdout).state, 'already-applied');
  } finally { await rm(fixture.root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});

test('unknown version still rejects changed source hashes before writing', async () => {
  const fixture = await patchFixture();
  try {
    const changed = 'foreign source\n';
    await writeFile(join(fixture.checkout, 'source.txt'), changed);
    const result = fixture.run('--apply');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Target files differ or patch is partial; no files changed/u);
    assert.equal(await readFile(join(fixture.checkout, 'source.txt'), 'utf8'), changed);
  } finally { await rm(fixture.root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});

test('source patcher still rejects a different package identity', async () => {
  const fixture = await patchFixture();
  try {
    await writeFile(join(fixture.checkout, 'packages/coding-agent/package.json'), JSON.stringify({ name: 'foreign', version: '1.3.0' }));
    const result = fixture.run('--apply');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Requires an @earendil-works\/pi-coding-agent source checkout/u);
    assert.equal(await readFile(join(fixture.checkout, 'source.txt'), 'utf8'), fixture.before);
  } finally { await rm(fixture.root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});

test('native qualification generator permits unknown versions while checking required capabilities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elicitation-prepare-'));
  try {
    const checkout = join(root, 'checkout'), companion = join(root, 'companion'), rpiv = join(root, 'rpiv');
    const put = async (path, contents = '') => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, contents); };
    const pkg = (name, extensions) => JSON.stringify({ name, version: '99.0.0', pi: { extensions } });
    await put(join(checkout, 'packages/coding-agent/package.json'), pkg('@earendil-works/pi-coding-agent'));
    await put(join(rpiv, 'package.json'), pkg('@juicesharp/rpiv-ask-user-question', ['./index.ts']));
    await put(join(companion, 'package.json'), pkg('pi-mcp-elicitation', ['./index.ts']));
    for (const path of ['node_modules/vitest/dist/cli.js', 'packages/coding-agent/vitest.config.ts', 'packages/coding-agent/test/suite/harness.ts', 'packages/coding-agent/src/extensions/mcp/index.ts', 'packages/coding-agent/src/core/resource-loader.ts', 'packages/coding-agent/src/core/settings-manager.ts', 'packages/coding-agent/src/extensions/mcp/elicitation.ts']) await put(join(checkout, path));
    for (const path of ['index.ts', 'src/extension.mjs', 'src/form.mjs', 'test/contract-cases.mjs']) await put(join(companion, path));
    await put(join(rpiv, 'index.ts'));
    for (const name of ['native.fixture.mjs', 'contract.native.fixture.mjs']) await put(join(companion, 'test', name), "const harness = '__HARNESS__';\n");
    const generator = join(companion, 'scripts/prepare-native-test.mjs');
    await put(generator, await readFile(new URL('../scripts/prepare-native-test.mjs', import.meta.url), 'utf8'));
    const runGenerator = () => spawnSync(process.execPath, [generator, checkout, rpiv], { encoding: 'utf8' });
    const result = runGenerator();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /99[.]0[.]0 compatibility is unknown/u);
    assert.equal(JSON.parse(result.stdout).generated.length, 2);
    const target = join(checkout, 'packages/coding-agent/test/suite/aituning-elicitation.integration.test.mjs');
    const generated = await readFile(target, 'utf8');
    await rm(join(checkout, 'packages/coding-agent/src/extensions/mcp/elicitation.ts'));
    const missing = runGenerator();
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /elicitation[.]ts/u);
    assert.equal(await readFile(target, 'utf8'), generated);
    await put(join(checkout, 'packages/coding-agent/src/extensions/mcp/elicitation.ts'));
    await put(join(rpiv, 'package.json'), pkg('foreign', ['./index.ts']));
    const wrongIdentity = runGenerator();
    assert.equal(wrongIdentity.status, 1);
    assert.match(wrongIdentity.stderr, /Expected @juicesharp\/rpiv-ask-user-question/u);
    assert.equal(await readFile(target, 'utf8'), generated);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});
