import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (file, ...args) => spawnSync(process.execPath, [join(root, file), ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });

test('disabled behavior targets produce an offline plan with zero sessions', () => {
  const result = run('behave.mjs', '--case', 'trace-order-flow');
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.sessions, 0);
  assert.ok(plan.targets.every((target) => target.problem.includes('disabled')));
});

test('micro plans both variants without enabling targets or writing output', () => {
  const folder = join(root, 'examples/wording');
  const result = run('micro.mjs', folder, '5', '--plan');
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, 'plan');
  assert.equal(plan.modelsExecuted, false);
  assert.equal(plan.samples, 20);
  assert.deepEqual(plan.variants.sort(), ['variant-concise', 'variant-none']);
  assert.ok(plan.targets.every((target) => !target.enabled));
  assert.equal(existsSync(join(folder, 'out')), false);
});

test('disabled micro execution refuses before any sample', () => {
  const result = run('micro.mjs', join(root, 'examples/wording'), '1');
  assert.equal(result.status, 2);
  assert.match(JSON.parse(result.stdout).error, /no runnable targets/);
});

test('unknown ablation input fails before harness execution', () => {
  const result = run('behave.mjs', '--case', 'trace-order-flow', '--ablate', 'missing-skill');
  assert.equal(result.status, 2);
  assert.match(JSON.parse(result.stdout).error, /unknown skill/);
});
