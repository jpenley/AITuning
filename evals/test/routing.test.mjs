import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { firstSkill, loadFailure, routeVerdict, sessionFailure } from '../lib/routing.mjs';
import { EVALS_DIR, loadSkills } from '../lib/skills.mjs';

const names = ['diagnose', 'harden'];
test('first skill load preserves order and ignores prose and search commands', () => {
  const calls = [
    { name: 'shell', input: 'rg skills/diagnose/SKILL.md .' },
    { name: 'read', input: JSON.stringify({ file_path: 'C:/tmp/.agents/skills/harden/SKILL.md' }) },
    { name: 'read', input: JSON.stringify({ file_path: 'C:/tmp/.agents/skills/diagnose/SKILL.md' }) },
  ];
  assert.equal(firstSkill(calls, 'codex', names).skill, 'harden');
  assert.equal(firstSkill(calls, 'codex', names).index, 1);
  assert.equal(firstSkill([{ name: 'read', input: '{"filePath":".agents/skills/harden/SKILL.md"}' }], 'opencode', names).skill, 'harden');
});

test('Claude Skill tool uses the actual requested skill', () => {
  assert.equal(firstSkill([{ name: 'Skill', input: '{"skill":"flowstate:diagnose"}' }], 'claude', names).skill, 'diagnose');
  assert.equal(firstSkill([{ name: 'Read', input: '{"file_path":"skills/diagnose/SKILL.md"}' }], 'claude', names).status, 'none');
});

test('a first native skill outside the catalog is not replaced by a later expected load', () => {
  for (const [harness, name, input] of [
    ['claude', 'Skill', '{"skill":"superpowers:brainstorming"}'],
    ['opencode', 'skill', '{"name":"brainstorming"}'],
  ]) {
    const calls = [{ name, input }, { name, input: '{"skill":"diagnose"}' }];
    const observation = firstSkill(calls, harness, names);
    assert.equal(observation.skill, 'brainstorming');
    assert.equal(observation.index, 0);
    assert.equal(routeVerdict(observation, 'diagnose'), 'wrong');
  }
});

test('Codex PowerShell command loads a skill even when the command is quoted', () => {
  const calls = [{ name: 'shell', input: '"C:/pwsh.exe" -Command "Get-Content \u0027C:/tmp/.agents/skills/dig/SKILL.md\u0027"' }];
  assert.equal(firstSkill(calls, 'codex', ['dig']).skill, 'dig');
});

test('none, ambiguous, and invalid routes stay distinct', () => {
  const none = firstSkill([{ name: 'shell', input: 'echo diagnose' }], 'codex', names);
  const ambiguous = firstSkill([{ name: 'shell', input: 'cat skills/diagnose/SKILL.md skills/harden/SKILL.md' }], 'codex', names);
  assert.equal(routeVerdict(none, 'diagnose'), 'none');
  assert.equal(routeVerdict(ambiguous, 'diagnose'), 'ambiguous');
  assert.equal(routeVerdict({ skill: 'diagnose', status: 'observed' }, 'diagnose', { timedOut: true }), 'invalid');
  assert.equal(routeVerdict({ skill: 'diagnose', status: 'observed' }, 'diagnose', { truncated: true }), 'uncertain');
  assert.equal(routeVerdict({ skill: 'harden', status: 'observed' }, 'diagnose'), 'wrong');
  assert.equal(routeVerdict({ skill: 'diagnose', status: 'observed' }, 'diagnose', { sessionFailed: true }), 'invalid');
});

test('PowerShell comma-separated paths cannot give one skill routing credit', () => {
  for (const input of [
    'Get-Content -LiteralPath "skills/dig/SKILL.md","skills/harden/SKILL.md"',
    "Get-Content -Path 'skills/dig/SKILL.md', 'skills/harden/SKILL.md' -Raw",
    'gc skills/dig/SKILL.md,skills/harden/SKILL.md',
  ]) {
    const observation = firstSkill([{ name: 'shell', input }], 'codex', ['dig', 'harden']);
    assert.equal(routeVerdict(observation, 'dig'), 'ambiguous', input);
    assert.deepEqual(observation.candidates, ['dig', 'harden']);
  }
});

test('shell prose and a search beside an unrelated read do not load a skill', () => {
  for (const input of ['echo "cat skills/diagnose/SKILL.md"', 'echo "help; cat skills/diagnose/SKILL.md"', 'Get-Content README.md; rg skills/diagnose/SKILL.md .', 'cat README.md # skills/diagnose/SKILL.md', 'sed -n "\\|skills/diagnose/SKILL.md|p" README.md', 'Get-Content README.md -Filter skills/diagnose/SKILL.md']) {
    assert.equal(firstSkill([{ name: 'shell', input }], 'codex', names).status, 'none');
  }
  assert.equal(firstSkill([{ name: 'find_skill', input: '{"name":"diagnose"}' }], 'opencode', names).status, 'none');
  assert.equal(firstSkill([{ name: 'read', input: '{"file_path":"README.md","description":"skills/diagnose/SKILL.md"}' }], 'codex', names).status, 'none');
});

test('failed terminal events invalidate each harness but a tool error alone does not', () => {
  for (const [harness, ev] of [
    ['claude', { type: 'result', subtype: 'error_max_turns', is_error: true }],
    ['codex', { type: 'turn.failed', error: { message: 'model unavailable' } }],
    ['opencode', { type: 'error', error: { message: 'model unavailable' } }],
  ]) {
    const failure = sessionFailure(JSON.stringify(ev), harness);
    assert.ok(failure);
    assert.equal(routeVerdict({ skill: 'dig', status: 'observed' }, 'dig', { sessionFailed: Boolean(failure) }), 'invalid');
  }
  assert.equal(sessionFailure(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true }] } }), 'claude'), null);
  assert.equal(sessionFailure([{ type: 'error', message: 'Reconnecting...' }, { type: 'turn.completed' }].map(JSON.stringify).join('\n'), 'codex'), null);
});

test('a failed skill load keeps the routing choice but emits a warning', () => {
  const observation = firstSkill([{ name: 'Skill', input: '{"skill":"flowstate:dig"}' }], 'claude', ['dig']);
  const events = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'call-1', name: 'Skill', input: { skill: 'flowstate:dig' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'call-1', is_error: true }] } },
  ].map(JSON.stringify).join('\n');
  assert.match(loadFailure(events, 'claude', observation), /error/);
  assert.equal(routeVerdict(observation, 'dig'), 'correct');
  const command = 'Get-Content C:/tmp/.agents/skills/dig/SKILL.md';
  const codex = firstSkill([{ name: 'shell', input: command }], 'codex', ['dig']);
  assert.match(loadFailure(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command, exit_code: 1 } }), 'codex', codex), /failed/);
  const longCommand = command + ' ' + 'x'.repeat(1100);
  const longRead = firstSkill([{ name: 'shell', input: longCommand }], 'codex', ['dig']);
  assert.equal(longRead.evidence.input.length, 1000);
  assert.match(loadFailure(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: longCommand, exit_code: 1 } }), 'codex', longRead), /failed/);
  const local = firstSkill([{ name: 'skill', input: '{"name":"dig"}' }], 'opencode', ['dig']);
  assert.match(loadFailure(JSON.stringify({ part: { tool: 'skill', state: { input: { name: 'dig' }, status: 'error' } } }), 'opencode', local), /error/);
});

test('native opencode tool-output truncation prevents routing credit in the saved matrix', () => {
  const root = mkdtempSync(join(tmpdir(), 'routing-truncation-test-'));
  let outDir;
  try {
    const harness = join(root, 'harness.mjs');
    const event = { type: 'tool_use', part: { tool: 'skill', state: { input: { name: 'dig' }, status: 'completed', metadata: { truncated: true } } } };
    writeFileSync(harness, `console.log(${JSON.stringify(JSON.stringify(event))});\n`);
    const targets = join(root, 'targets.json');
    writeFileSync(targets, JSON.stringify({ judge: { harness: 'claude' }, targets: [
      { id: 'fixture', harness: 'opencode', model: 'fixture/model', command: [process.execPath, harness], enabled: true },
    ] }));
    const run = spawnSync(process.execPath, [join(EVALS_DIR, 'behave.mjs'), '--routing', '--run', '--case', 'dig#p0', '--targets', targets], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(run.status, 0, run.stderr);
    outDir = JSON.parse(run.stdout).outDir;
    const saved = JSON.parse(readFileSync(join(outDir, 'results.json'), 'utf8'));
    const route = saved.matrix[0].targets.fixture[0];
    assert.equal(route.observed, 'dig');
    assert.equal(route.status, 'uncertain');
    assert.match(route.warnings.join(' '), /tool output.*truncated/i);
    assert.match(readFileSync(join(outDir, 'dig#p0', 'fixture', 'with-1.jsonl'), 'utf8'), /"truncated":true/);
  } finally {
    if (outDir) {
      assert.ok(resolve(outDir).startsWith(resolve(join(EVALS_DIR, 'results')) + sep));
      rmSync(outDir, { recursive: true, force: true });
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('routing CLI validates selectors, installs only frontmatter, and saves failed and unavailable targets', () => {
  const root = mkdtempSync(join(tmpdir(), 'routing-cli-test-'));
  const outDirs = [];
  try {
    const marker = join(root, 'called');
    const harness = join(root, 'harness.mjs');
    writeFileSync(harness, `
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
writeFileSync(${JSON.stringify(marker)}, 'called');
const names = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] !== '--plugin-dir') continue;
  const dir = process.argv[++i];
  const manifest = JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'));
  for (const path of manifest.skills) {
    const src = readFileSync(join(dir, path, 'SKILL.md'), 'utf8');
    if (!/^---\\n[\\s\\S]*?\\n---\\n$/.test(src) || /disable-model-invocation: true/.test(src)) throw new Error('catalog includes body or user-only skill');
    names.push(src.match(/^name: (.+)$/m)[1]);
  }
}
console.log(JSON.stringify({ type: 'catalog', names: names.sort() }));
console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'flowstate:dig' } }] } }));
console.log(JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true }));
`);
    const targets = join(root, 'targets.json');
    writeFileSync(targets, JSON.stringify({ judge: { harness: 'claude' }, targets: [
      { id: 'fixture', family: 'fixture', harness: 'claude', command: [process.execPath, harness], enabled: true },
      { id: 'unavailable', family: 'fixture', harness: 'claude', command: [process.execPath, harness], enabled: false },
    ] }));
    const run = (...args) => spawnSync(process.execPath, [join(EVALS_DIR, 'behave.mjs'), '--routing', '--targets', targets, ...args], { encoding: 'utf8', timeout: 60_000 });
    for (const args of [['--case', 'missing'], ['--case', ''], ['--case', 'dig#p0,'], ['--case'], ['--run']]) {
      const r = run(...args);
      assert.equal(r.status, 2, r.stderr);
      assert.equal(existsSync(marker), false, 'invalid selection launched a harness');
    }
    const plan = run('--case', 'dig#p0,dig#p0');
    assert.equal(plan.status, 0, plan.stderr);
    const planned = JSON.parse(plan.stdout);
    assert.equal(planned.sessions, 1);
    assert.deepEqual(planned.cases, [{ id: 'dig#p0', expected: 'dig', heldOut: true }]);
    assert.equal(existsSync(marker), false, 'dry plan launched a harness');
    const live = run('--run', '--case', 'dig#p0');
    assert.equal(live.status, 0, live.stderr);
    const result = JSON.parse(live.stdout);
    const outDir = result.outDir;
    outDirs.push(outDir);
    const saved = JSON.parse(readFileSync(join(outDir, 'results.json'), 'utf8'));
    const transcript = readFileSync(join(outDir, 'dig#p0', 'fixture', 'with-1.jsonl'), 'utf8');
    const catalog = JSON.parse(transcript.split('\n')[0]);
    assert.deepEqual(catalog.names, loadSkills().filter((s) => !s.userOnly).map((s) => s.name).sort());
    assert.equal(saved.matrix[0].targets.fixture[0].status, 'invalid', 'failed terminal event got route credit');
    assert.equal(saved.matrix[0].targets.unavailable[0].status, 'unavailable');
    assert.match(saved.matrix[0].targets.unavailable[0].warnings[0], /disabled/);
    assert.equal(saved.rows[0].invalid, true);
    assert.match(saved.rows[0].warnings.join(' '), /error_max_turns/);
    const absent = run('--run', '--case', 'dig#p0', '--target', 'unavailable');
    assert.equal(absent.status, 2, absent.stderr);
    const unavailable = JSON.parse(absent.stdout);
    if (unavailable.outDir) outDirs.push(unavailable.outDir);
    assert.equal(unavailable.matrix[0].targets.unavailable[0].status, 'unavailable');
    assert.ok(existsSync(join(unavailable.outDir, 'results.json')));
  } finally {
    for (const outDir of outDirs) {
      assert.ok(resolve(outDir).startsWith(resolve(join(EVALS_DIR, 'results')) + sep));
      rmSync(outDir, { recursive: true, force: true });
    }
    rmSync(root, { recursive: true, force: true });
  }
});
