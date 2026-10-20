import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { EVALS_DIR } from '../lib/skills.mjs';

// The copied runner and fake CLI make the public plan/result contract observable without model calls.
function fixture(harness = 'opencode') {
  const root = mkdtempSync(join(tmpdir(), 'ablation-test-'));
  const evals = join(root, 'evals');
  mkdirSync(evals);
  cpSync(join(EVALS_DIR, 'behave.mjs'), join(evals, 'behave.mjs'));
  cpSync(join(EVALS_DIR, 'lib'), join(evals, 'lib'), { recursive: true });
  mkdirSync(join(root, 'skills', '.claude-plugin'), { recursive: true });
  const paths = ['alpha', 'beta', 'gamma'].map(name => `./test/${name}`);
  writeFileSync(join(root, 'skills', '.claude-plugin', 'plugin.json'),JSON.stringify({ name: 'flowstate', version: '1.0.0', skills: paths }));
  for (const name of ['alpha', 'beta', 'gamma']) {
    const dir = join(root, 'skills', 'test', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Use when testing ${name}.\n---\n${name} body\n`);
    writeFileSync(join(dir, 'helper.txt'), `${name} helper\n`);
  }
  const caseDir = join(evals, 'family', 'sample');
  mkdirSync(join(caseDir, 'graders'), { recursive: true });
  writeFileSync(join(caseDir, 'task.md'), '---\nvary: skills\n---\nInspect the fixture.\n');
  writeFileSync(join(caseDir, 'graders', 'reply.md'), '---\ntype: regex\n---\nfixture-ok\n');
  const cli = join(root, 'cli.mjs');
  writeFileSync(cli, 'console.log(JSON.stringify({type:"text",text:"fixture-ok"}));\n');
  const targets = join(root, 'targets.json');
  writeFileSync(targets, JSON.stringify({ judge: { harness: 'claude' }, targets: [{ id: 'fixture', harness, model: 'fixture', command: [process.execPath, cli], enabled: true }] }));
  const run = (...args) => spawnSync(process.execPath, [join(evals, 'behave.mjs'), '--case', 'sample', '--targets', targets, '--no-judge', ...args], { encoding: 'utf8', timeout: 60_000 });
  return { root, evals, cli, targets, run, clean: () => rmSync(root, { recursive: true, force: true }) };
}

test('ablation rejects unknown or empty skill selectors before launching a harness', () => {
  const f = fixture();
  try {
    for (const selector of ['unknown', '', 'alpha,', '--run']) {
      const r = f.run('--ablate', selector);
      assert.equal(r.status, 2, `selector ${JSON.stringify(selector)} was accepted: ${r.stdout}`);
      assert.match(JSON.parse(r.stdout).error, /ablat/i);
    }
  } finally { f.clean(); }
});

for (const harness of ['opencode', 'claude']) test(`ablation preserves neighbors and helpers, removes selected skills physically, and isolates results (${harness})`, () => {
  const f = fixture(harness);
  try {
    writeFileSync(f.cli, `import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const args=process.argv.slice(2);
const roots=args.flatMap((arg,i)=>arg==='--plugin-dir'?[args[i+1]]:[]);
const dirs=roots.length?roots.flatMap(root=>JSON.parse(readFileSync(join(root,'.claude-plugin','plugin.json'),'utf8')).skills.map(p=>join(root,p))):readdirSync(join(process.cwd(),'.agents','skills')).map(p=>join(process.cwd(),'.agents','skills',p));
const installed=dirs.map(dir=>({name:dir.split(/[\\\\/]/).at(-1),helper:readFileSync(join(dir,'helper.txt'),'utf8')})).sort((a,b)=>a.name.localeCompare(b.name));
const reply=JSON.stringify(installed);
console.log(JSON.stringify({type:'text',text:reply}));
console.log(JSON.stringify({type:'result',result:reply}));
`);
    const r = f.run('--ablate', 'gamma,alpha,alpha', '--run');
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout);
    assert.match(basename(result.outDir), /^ablation-/);
    const saved = JSON.parse(readFileSync(join(result.outDir, 'results.json'), 'utf8'));
    assert.deepEqual(saved.experiment.removed, ['alpha', 'gamma']);
    const replies = Object.fromEntries(['with', 'without'].map(arm => [arm, JSON.parse(readFileSync(join(result.outDir, 'sample', 'fixture', `${arm}-1.reply.md`), 'utf8'))]));
    assert.deepEqual(replies.with, ['alpha', 'beta', 'gamma'].map(name => ({ name, helper: `${name} helper\n` })));
    assert.deepEqual(replies.without, [{ name: 'beta', helper: 'beta helper\n' }]);
    assert.equal(saved.experiment.arms.with.find(s => s.name === 'beta').sha256, saved.experiment.arms.without[0].sha256);
    assert.equal(saved.experiment.arms.without[0].sha256.length, 64);
    assert.equal(existsSync(join(f.evals, 'results', 'behave-fingerprints.json')), false);
    assert.equal(existsSync(join(f.evals, 'results', 'judge-cache.json')), false);
  } finally { f.clean(); }
});

test('behavior results show extra and failed load attempts without grading failed sessions', () => {
  const f = fixture('claude');
  try {
    writeFileSync(f.cli, `const calls=[
 {type:'assistant',message:{content:[{type:'tool_use',id:'a',name:'Skill',input:{skill:'alpha'}},{type:'tool_use',id:'b',name:'Read',input:{file_path:'/tmp/skills/beta/SKILL.md'}}]}},
 {type:'user',message:{content:[{type:'tool_result',tool_use_id:'a',content:'ok'},{type:'tool_result',tool_use_id:'b',is_error:true,content:'denied'}]}},
 {type:'result',is_error:true,subtype:'error_max_turns',result:'fixture-ok'}];
for(const event of calls) console.log(JSON.stringify(event));\n`);
    const r = f.run('--run', '--arm', 'with');
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout);
    const saved = JSON.parse(readFileSync(join(result.outDir, 'results.json'), 'utf8'));
    const row = saved.rows[0];
    assert.equal(row.invalid, true);
    assert.deepEqual(row.grades, []);
    assert.deepEqual(row.loadSet.attempted, ['alpha', 'beta']);
    assert.equal(row.loadSet.status, 'invalid');
    assert.match(row.loadSet.warnings.join(' '), /beta.*error/);
  } finally { f.clean(); }
});

test('expected load set catches extra skills but ignores echo and search mentions', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.evals, 'family', 'sample', 'task.md'), '---\nvary: skills\nexpected_loads: [alpha]\n---\nInspect the fixture.\n');
    writeFileSync(f.cli, `const events=[
 {type:'tool_use',part:{tool:'skill',state:{input:{name:'alpha'},status:'completed'}}},
 {type:'tool_use',part:{tool:'skill',state:{input:{name:'beta'},status:'completed'}}},
 {type:'item.completed',item:{type:'command_execution',command:'echo /tmp/skills/gamma/SKILL.md',exit_code:0}},
 {type:'item.completed',item:{type:'command_execution',command:'rg alpha /tmp/skills/gamma/SKILL.md',exit_code:0}},
 {type:'text',text:'fixture-ok'}];
for(const event of events) console.log(JSON.stringify(event));\n`);
    const r = f.run('--run', '--arm', 'with');
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout);
    const row = JSON.parse(readFileSync(join(result.outDir, 'results.json'), 'utf8')).rows[0];
    assert.deepEqual(row.loadSet.attempted, ['alpha', 'beta']);
    assert.deepEqual(row.loadSet.unexpected, ['beta']);
    assert.deepEqual(row.loadSet.missing, []);
    assert.equal(row.grades.find(g => g.id === 'expected_loads').status, 'fail');
    const summary = JSON.parse(readFileSync(join(result.outDir, 'results.json'), 'utf8')).summary[0];
    assert.equal(summary.graders.find(g => g.id === 'expected_loads').with.passed, 0);
  } finally { f.clean(); }
});

test('ablation refuses mixed instruction controls and cache reuse; unavailable sessions cannot pass', () => {
  const f = fixture();
  try {
    assert.equal(f.run('--ablate', 'alpha', '--changed').status, 2);
    assert.equal(f.run('--ablate', 'alpha', '--selftest').status, 2);
    assert.equal(f.run('--ablate', 'alpha', '--arm', 'control:short').status, 2);
    writeFileSync(join(f.root, 'instructions.md'), '## Example\n```markdown\nKeep this.\n```\n');
    writeFileSync(join(f.evals, 'family', 'sample', 'task.md'), '---\nvary: skills\nagents_md: instructions.md#Example\n---\nInspect.\n');
    assert.equal(f.run('--ablate', 'alpha').status, 2);
    writeFileSync(join(f.evals, 'family', 'sample', 'task.md'), '---\nvary: skills\n---\nInspect.\n');
    const targets = JSON.parse(readFileSync(f.targets, 'utf8'));
    targets.targets[0].enabled = false;
    writeFileSync(f.targets, JSON.stringify(targets));
    const r = f.run('--ablate', 'alpha', '--run');
    assert.equal(r.status, 2);
    assert.match(JSON.parse(r.stdout).error, /no runnable targets/);
  } finally { f.clean(); }
});

test('default controls remain empty and repeated failed loads remain visible', () => {
  const f = fixture('claude');
  try {
    writeFileSync(f.cli, `const args=process.argv.slice(2);const installed=args.includes('--plugin-dir');
const events=installed?[
 {type:'assistant',message:{content:[{type:'tool_use',id:'first',name:'Skill',input:{skill:'alpha'}},{type:'tool_use',id:'retry',name:'Skill',input:{skill:'alpha'}}]}},
 {type:'user',message:{content:[{type:'tool_result',tool_use_id:'first',content:'ok'},{type:'tool_result',tool_use_id:'retry',is_error:true}]}},
 {type:'result',result:'fixture-ok'}]:[{type:'result',result:'fixture-ok'}];
for(const event of events) console.log(JSON.stringify(event));\n`);
    const r = f.run('--run');
    assert.equal(r.status, 0, r.stderr);
    const saved = JSON.parse(readFileSync(join(JSON.parse(r.stdout).outDir, 'results.json'), 'utf8'));
    assert.equal(saved.experiment, null);
    assert.equal(saved.rows.find(r => r.arm === 'with').loadSet.status, 'failed-load');
    assert.deepEqual(saved.rows.find(r => r.arm === 'without').loadSet.attempted, []);
    assert.equal(existsSync(join(f.evals, 'results', 'behave-fingerprints.json')), true);
  } finally { f.clean(); }
});

test('truncated load evidence receives no passing assertion or reusable fingerprint', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.evals, 'family', 'sample', 'task.md'), '---\nvary: skills\nexpected_loads: [alpha]\n---\nInspect.\n');
    writeFileSync(f.cli, `console.log(JSON.stringify({type:'tool_use',part:{tool:'skill',state:{input:{name:'alpha'},status:'completed',metadata:{truncated:true}}}}));
console.log(JSON.stringify({type:'text',text:'fixture-ok'}));\n`);
    const r = f.run('--run');
    assert.equal(r.status, 0, r.stderr);
    const saved = JSON.parse(readFileSync(join(JSON.parse(r.stdout).outDir, 'results.json'), 'utf8'));
    assert.equal(saved.rows[0].loadSet.status, 'uncertain');
    assert.equal(saved.rows[0].grades.find(g => g.id === 'expected_loads').status, 'error');
    assert.deepEqual(JSON.parse(readFileSync(join(f.evals, 'results', 'behave-fingerprints.json'), 'utf8')), {});
  } finally { f.clean(); }
});

test('expected loads reject unknown names and conflicting grader IDs before launch', () => {
  const f = fixture();
  try {
    const task = join(f.evals, 'family', 'sample', 'task.md');
    writeFileSync(task, '---\nvary: skills\nexpected_loads: [typo]\n---\nInspect.\n');
    assert.equal(f.run().status, 2);
    writeFileSync(task, '---\nvary: skills\nexpected_loads: [alpha]\n---\nInspect.\n');
    writeFileSync(join(f.evals, 'family', 'sample', 'graders', 'expected_loads.md'), '---\ntype: regex\n---\nfixture-ok\n');
    assert.equal(f.run().status, 2);
  } finally { f.clean(); }
});

test('ablation subtracts removed loads from expectations and reports a missing neighbor', () => {
  const f = fixture('claude');
  try {
    writeFileSync(join(f.evals, 'family', 'sample', 'task.md'), '---\nvary: skills\nexpected_loads: [alpha, beta]\n---\nInspect.\n');
    writeFileSync(f.cli, `import {readFileSync} from 'node:fs';import {join} from 'node:path';
const args=process.argv.slice(2);const dir=args[args.indexOf('--plugin-dir')+1];
const names=JSON.parse(readFileSync(join(dir,'.claude-plugin','plugin.json'),'utf8')).skills.map(p=>p.split('/').at(-1)).filter(n=>n==='alpha'||n==='beta');
console.log(JSON.stringify({type:'assistant',message:{content:names.map(n=>({type:'tool_use',id:n,name:'Skill',input:{skill:n}}))}}));
console.log(JSON.stringify({type:'result',result:'fixture-ok'}));\n`);
    const r = f.run('--ablate', 'alpha', '--run');
    assert.equal(r.status, 0, r.stderr);
    const saved = JSON.parse(readFileSync(join(JSON.parse(r.stdout).outDir, 'results.json'), 'utf8'));
    for (const row of saved.rows) assert.equal(row.grades.find(g => g.id === 'expected_loads').status, 'pass');
    assert.deepEqual(saved.rows.find(r => r.arm === 'without').loadSet.expected, ['beta']);
    writeFileSync(f.cli, "console.log(JSON.stringify({type:'result',result:'fixture-ok'}));\n");
    const missing = f.run('--ablate', 'alpha', '--run', '--arm', 'without');
    const row = JSON.parse(readFileSync(join(JSON.parse(missing.stdout).outDir, 'results.json'), 'utf8')).rows[0];
    assert.deepEqual(row.loadSet.missing, ['beta']);
    assert.equal(row.grades.find(g => g.id === 'expected_loads').status, 'fail');
  } finally { f.clean(); }
});

for (const [tool, input] of [
  ['read', { filePath: '/tmp/skills/alpha/SKILL.md' }],
  ['bash', { command: 'cat /tmp/skills/alpha/SKILL.md', description: 'Read the skill' }],
]) test(`a failed OpenCode ${tool} skill-file read fails the load assertion`, () => {
  const f = fixture();
  try {
    writeFileSync(join(f.evals, 'family', 'sample', 'task.md'), '---\nvary: skills\nexpected_loads: [alpha]\n---\nInspect.\n');
    writeFileSync(f.cli, `console.log(JSON.stringify({type:'tool_use',part:{tool:${JSON.stringify(tool)},state:{input:${JSON.stringify(input)},status:'error',error:'denied'}}}));
console.log(JSON.stringify({type:'text',text:'fixture-ok'}));\n`);
    const r = f.run('--run', '--arm', 'with');
    const row = JSON.parse(readFileSync(join(JSON.parse(r.stdout).outDir, 'results.json'), 'utf8')).rows[0];
    assert.deepEqual(row.loadSet.attempted, ['alpha']);
    assert.equal(row.loadSet.status, 'failed-load');
    assert.equal(row.grades.find(g => g.id === 'expected_loads').status, 'fail');
  } finally { f.clean(); }
});

test('an exception after a passing grade excludes the entire session from scores', () => {
  const f = fixture('claude');
  try {
    writeFileSync(join(f.evals, 'family', 'sample', 'graders', 'z-broken.md'), '---\ntype: tool_used\ntool: read\ninput_match: [\n---\n');
    writeFileSync(f.cli, "console.log(JSON.stringify({type:'result',result:'fixture-ok'}));\n");
    const r = f.run('--run', '--arm', 'with');
    const saved = JSON.parse(readFileSync(join(JSON.parse(r.stdout).outDir, 'results.json'), 'utf8'));
    assert.equal(saved.rows[0].invalid, true);
    assert.deepEqual(saved.rows[0].grades, []);
    assert.equal(saved.summary[0].with, null);
    assert.ok(existsSync(join(JSON.parse(r.stdout).outDir, 'sample', 'fixture', 'with-1.jsonl')), 'failed grading still retains transcript');
  } finally { f.clean(); }
});

test('ablation rejects fixture skill catalogs before launching a harness', () => {
  const f = fixture();
  try {
    const ws = join(f.evals, 'family', 'sample', 'workspace');
    for (const directory of ['.agents', '.claude', '.codex']) {
      const dir = join(ws, directory, 'skills', 'alpha');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), 'fixture shadow skill');
      const r = f.run('--ablate', 'alpha', '--run');
      assert.equal(r.status, 2, directory);
      assert.match(JSON.parse(r.stdout).error, /fixture.*skills/i);
      rmSync(join(ws, directory), { recursive: true, force: true });
    }
  } finally { f.clean(); }
});

test('ablation rejects participating packs without a manifest or complete membership', () => {
  const f = fixture();
  try {
    const pack = join(f.root, 'packs', 'extra');
    const dir = join(pack, 'skills', 'delta');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: delta\ndescription: Use when testing delta.\n---\nBody.\n');
    assert.equal(f.run('--ablate', 'alpha').status, 2);
    mkdirSync(join(pack, '.claude-plugin'));
    writeFileSync(join(pack, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'extra', version: '1.0.0', skills: [] }));
    assert.equal(f.run('--ablate', 'alpha').status, 2);
  } finally { f.clean(); }
});
