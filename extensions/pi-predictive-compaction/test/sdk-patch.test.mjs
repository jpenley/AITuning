import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { planSdkSupport, applySdkSupport, restoreSdkSupport, patchText, sha } from '../sdk-support.mjs';
import { root } from './helpers.mjs';

function originalCopy() {
  const directory = mkdtempSync(join(tmpdir(), 'predictive-patch-'));
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '1.3.0' }));
  for (const item of planSdkSupport(root)) {
    const file = join(directory, item.path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, item.before);
  }
  return directory;
}

test('SDK patch and restore round trip every native/bundled byte; reapplication is idempotent', () => {
  const directory = originalCopy();
  const original = planSdkSupport(directory).map(x => [x.path, sha(x.before)]);
  const first = applySdkSupport(directory);
  assert.deepEqual(applySdkSupport(directory), first);
  assert.equal(planSdkSupport(directory).filter(x => x.installed).length, 10);
  restoreSdkSupport(directory);
  assert.deepEqual(planSdkSupport(directory).map(x => [x.path, sha(x.before)]), original);
  assert.ok(planSdkSupport(directory).every(x => !x.installed));
});

test('one changed source or unsupported version rejects the entire patch before writing any file', () => {
  const directory = originalCopy();
  const file = join(directory, 'dist/core/extensions/types.d.ts'); writeFileSync(file, readFileSync(file, 'utf8') + '// foreign change\n');
  const index = readFileSync(join(directory, 'dist/index.js'), 'utf8');
  assert.throws(() => applySdkSupport(directory), /hash mismatch/);
  assert.equal(readFileSync(join(directory, 'dist/index.js'), 'utf8'), index);
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '1.4.0' }));
  assert.throws(() => applySdkSupport(directory), /requires Pi 1.3.0/);
});

function legacyCopy() {
  const directory = originalCopy();
  for (const item of planSdkSupport(directory)) {
    const backup = join(directory, '.predictive-compaction-sdk-backup', item.path);
    mkdirSync(dirname(backup), { recursive: true });
    writeFileSync(backup, item.before);
    writeFileSync(join(directory, item.path), patchText(item.path, item.before, { inlineFooter: false, handoff: false }));
  }
  return directory;
}

test('the previous installed patch upgrades idempotently and restores the original distribution', () => {
  const directory = legacyCopy();
  const plan = planSdkSupport(directory);
  assert.ok(plan.some(item => item.upgrade));
  applySdkSupport(directory);
  assert.ok(planSdkSupport(directory).every(item => item.installed && !item.upgrade));
  assert.deepEqual(applySdkSupport(directory), applySdkSupport(directory));
  restoreSdkSupport(directory);
  for (const item of plan) assert.equal(readFileSync(join(directory, item.path), 'utf8'), item.before);
});

test('a failed upgrade rolls written files back to the previous patch, not the pristine distribution', () => {
  const directory = legacyCopy();
  const plan = planSdkSupport(directory);
  const last = plan.at(-1);
  writeFileSync(join(directory, last.path), last.before);
  writeFileSync(join(directory, '.predictive-compaction-sdk-backup', last.path), 'foreign backup');
  const previous = plan.map(item => [item.path, readFileSync(join(directory, item.path), 'utf8')]);
  assert.throws(() => applySdkSupport(directory), /Conflicting SDK backup/);
  for (const [path, content] of previous) assert.equal(readFileSync(join(directory, path), 'utf8'), content);
});

test('foreign changes on a previously installed patch reject upgrades before writing', () => {
  const directory = legacyCopy();
  const bundle = join(directory, 'dist/bundle/chunks/chunk-66G7ITPS.js');
  writeFileSync(bundle, readFileSync(bundle, 'utf8') + '// foreign change\n');
  const previous = readFileSync(join(directory, 'dist/modes/interactive/components/footer.js'), 'utf8');
  assert.throws(() => applySdkSupport(directory), /modified after patch/);
  assert.equal(readFileSync(join(directory, 'dist/modes/interactive/components/footer.js'), 'utf8'), previous);
});

for (const handoffVersion of [1, 2]) for (const inlineFooter of [false, true]) test(`known handoff v${handoffVersion}, inline footer ${inlineFooter}, upgrades and restores exact bytes`, () => {
  const directory = originalCopy();
  for (const item of planSdkSupport(directory)) {
    const backup = join(directory, '.predictive-compaction-sdk-backup', item.path);
    mkdirSync(dirname(backup), { recursive: true }); writeFileSync(backup, item.before);
    writeFileSync(join(directory, item.path), patchText(item.path, item.before, { handoffVersion, inlineFooter }));
  }
  assert.ok(planSdkSupport(directory).some(item => item.upgrade));
  applySdkSupport(directory);
  assert.ok(planSdkSupport(directory).every(item => item.installed));
  restoreSdkSupport(directory);
  assert.ok(planSdkSupport(directory).every(item => !item.installed));
});
