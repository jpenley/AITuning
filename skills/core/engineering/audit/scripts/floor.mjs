#!/usr/bin/env node
// floor.mjs: the floor record. The floor applies to automated changes. When the owner directs a change, nothing
// blocks it; at the end the owner approves the floor once, and it resets to the result: the floor guard's diff starts
// at the approval commit, and every numeric ratchet takes the value measured then, higher or lower.
//
// floor.json at the repository root lists the ratchets. Each names the command that measures it (an argv array run
// from the repository root that prints one JSON object on stdout; "node" means this Node), the field to read from
// that object (a dotted path), whether the floor is a minimum or a maximum, and its value:
//   { "version": 1, "ratchets": { "<name>": { "command": [...], "field": "a.b", "direction": "min", "value": 85 } } }
// The approval commit touches floor.json alone and carries the trailer "Floor-Approved: owner". Both belong to the
// owner: harnesses/shared/hooks/config-guard.mjs denies an agent's attempt at either, and the floor guard flags a floor.json that
// moved without approval. Neither can prove who made a commit; they keep honest automation from moving its own floor.
//
// Usage (from inside the repository):
//   node floor.mjs show       the approved floor commit and each ratchet's value
//   node floor.mjs check      measure every ratchet; fail if one is worse than its floor
//   node floor.mjs approve    owner only: show what the floor guard would flag, re-measure every ratchet, write
//                             floor.json and commit it with the trailer. Refuses while tracked changes are uncommitted.
//   node floor.mjs --selftest
// Exit codes: 0 ok, 1 a ratchet worse than its floor, 2 could not run (never read 2 as passing).
// stdout: one JSON object; stderr: a human-readable report.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FLOOR_FILE = 'floor.json';
export const FLOOR_TRAILER = /^Floor-Approved: owner$/;
const TRAILER_LINE = 'Floor-Approved: owner';

const here = dirname(fileURLToPath(import.meta.url));
const git = (args, opts = {}) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'], ...opts });
  } catch {
    return null;
  }
};
const finish = (status, extra, code) => {
  process.stdout.write(JSON.stringify({ status, ...extra }) + '\n');
  process.exit(code);
};
const fail = (reason, extra = {}) => {
  console.error(`floor: ${reason}`);
  finish('error', { reason, ...extra }, 2);
};

// The record, validated; null when the repository has none.
function load(root) {
  const path = join(root, FLOOR_FILE);
  if (!existsSync(path)) return null;
  let rec;
  try { rec = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { fail(`${FLOOR_FILE} is not valid JSON: ${e.message}`); }
  if (rec?.version !== 1 || typeof rec.ratchets !== 'object' || rec.ratchets === null || Array.isArray(rec.ratchets)) fail(`${FLOOR_FILE} needs "version": 1 and a "ratchets" object`);
  for (const [name, r] of Object.entries(rec.ratchets)) {
    const ok = Array.isArray(r?.command) && r.command.length > 0 && r.command.every((a) => typeof a === 'string')
      && typeof r.field === 'string' && r.field && ['min', 'max'].includes(r.direction) && Number.isFinite(r.value);
    if (!ok) fail(`${FLOOR_FILE}: ratchet "${name}" needs a command (argv array), a field, a direction (min or max) and a numeric value`);
  }
  return rec;
}

// Runs one ratchet's command and returns the measured number, or { error }.
function measure(root, name, r) {
  const [cmd, ...args] = r.command;
  const res = spawnSync(cmd === 'node' ? process.execPath : cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (res.error) return { error: `${name}: could not run ${cmd}: ${res.error.message}` };
  if (res.status !== 0) return { error: `${name}: ${r.command.join(' ')} exited ${res.status}${res.stderr ? `\n${res.stderr.trim().split('\n').slice(-5).join('\n')}` : ''}` };
  const last = res.stdout.trim().split('\n').filter(Boolean).pop() ?? '';
  let out;
  try { out = JSON.parse(last); } catch { return { error: `${name}: ${r.command.join(' ')} printed no JSON object on its last line` }; }
  const v = r.field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), out);
  if (!Number.isFinite(v)) return { error: `${name}: field "${r.field}" is not a number in the output` };
  return { value: v };
}
const worse = (r, v) => (r.direction === 'min' ? v < r.value : v > r.value);
const floorCommit = () => git(['log', '-1', '--format=%H', '-E', `--grep=${FLOOR_TRAILER.source}`, 'HEAD', '--', FLOOR_FILE])?.trim() || null;

function measureAll(root, rec) {
  const results = {};
  const errors = [];
  for (const [name, r] of Object.entries(rec.ratchets)) {
    const m = measure(root, name, r);
    if (m.error) errors.push(m.error);
    else results[name] = m.value;
  }
  return { results, errors };
}

function show(root) {
  const rec = load(root);
  const commit = floorCommit();
  if (!rec) { console.error('floor: no floor.json; the floor guard uses its default base'); finish('none', { commit }, 0); }
  console.error(`floor: approved at ${commit ? commit.slice(0, 8) : '(never: no approval commit yet)'}${rec.approved ? ` on ${rec.approved}` : ''}`);
  for (const [name, r] of Object.entries(rec.ratchets)) console.error(`  ${name}: ${r.direction === 'min' ? '>=' : '<='} ${r.value}`);
  finish('ok', { commit, approved: rec.approved ?? null, ratchets: rec.ratchets }, 0);
}

function check(root) {
  const rec = load(root);
  if (!rec) { console.error('floor: no floor.json; no ratchets to check'); finish('none', {}, 0); }
  const { results, errors } = measureAll(root, rec);
  if (errors.length) fail(`could not measure:\n  ${errors.join('\n  ')}`, { results });
  const below = Object.entries(rec.ratchets).filter(([name, r]) => worse(r, results[name]));
  for (const [name, r] of Object.entries(rec.ratchets)) {
    console.error(`  ${worse(r, results[name]) ? '✗' : '✓'} ${name}: ${results[name]} (floor ${r.direction === 'min' ? '>=' : '<='} ${r.value})`);
  }
  if (!below.length) { console.error('floor: every ratchet holds'); finish('pass', { results }, 0); }
  console.error(`floor: ${below.length} ratchet(s) worse than the floor. Fix the change; only the owner moves the floor (floor.mjs approve).`);
  finish('below', { results, below: below.map(([name]) => name) }, 1);
}

function approve(root) {
  const dirty = git(['status', '--porcelain', '--untracked-files=no'], { cwd: root });
  if (dirty === null) fail('git status failed');
  if (dirty.trim()) fail('tracked changes are uncommitted; commit or stash them first, since the floor is a commit');
  const rec = load(root) ?? { version: 1, ratchets: {} };
  // What this approval accepts: the floor guard's findings against the current floor, shown, never blocking.
  console.error('floor: what the floor guard reports against the current floor (approving accepts it):');
  spawnSync(process.execPath, [join(here, 'floor-guard.mjs')], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  const { results, errors } = measureAll(root, rec);
  if (errors.length) fail(`could not measure, so nothing was approved:\n  ${errors.join('\n  ')}`);
  const changes = [];
  for (const [name, r] of Object.entries(rec.ratchets)) {
    if (results[name] !== r.value) changes.push(`${name}: ${r.value} -> ${results[name]}`);
    r.value = results[name];
  }
  rec.approved = new Date().toISOString().slice(0, 10);
  writeFileSync(join(root, FLOOR_FILE), JSON.stringify(rec, null, 2) + '\n');
  const message = ['chore(floor): reset the floor', '', ...(changes.length ? changes : ['Ratchets unchanged.']), '', TRAILER_LINE, ''].join('\n');
  if (git(['add', '--', FLOOR_FILE], { cwd: root }) === null || git(['commit', '-q', '-F', '-', '--', FLOOR_FILE], { cwd: root, input: message }) === null) {
    fail(`${FLOOR_FILE} was written but the approval commit failed; inspect it before retrying`);
  }
  const commit = git(['rev-parse', 'HEAD'], { cwd: root })?.trim();
  console.error(`floor: approved at ${commit?.slice(0, 8)}${changes.length ? `; ${changes.join('; ')}` : '; ratchets unchanged'}`);
  finish('approved', { commit, results, changes }, 0);
}

function selftest() {
  const self = fileURLToPath(import.meta.url);
  const problems = [];
  const repo = mkdtempSync(join(tmpdir(), 'floor-selftest-'));
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const g = (...a) => execFileSync('git', ['-c', 'core.autocrlf=false', ...a], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const put = (f, s) => writeFileSync(join(repo, f), s);
  const run = (cmd, rate, cwd = repo) => {
    const r = spawnSync(process.execPath, [self, cmd], { cwd, encoding: 'utf8', env: { ...env, FLOOR_SELFTEST_RATE: String(rate) } });
    let out = {};
    try { out = JSON.parse(r.stdout.trim().split('\n').pop() || '{}'); } catch { /* reported by the caller */ }
    return { code: r.status, out };
  };
  try {
    g('init', '-q', '-b', 'main');
    put('measure.mjs', 'const rate = Number(process.env.FLOOR_SELFTEST_RATE);\nif (rate < 0) process.exit(3);\nconsole.log("progress");\nconsole.log(JSON.stringify({ rate, deep: { n: 3 } }));\n');
    const record = { version: 1, ratchets: {
      rate: { command: ['node', 'measure.mjs'], field: 'rate', direction: 'min', value: 80 },
      size: { command: ['node', 'measure.mjs'], field: 'deep.n', direction: 'max', value: 5 },
    } };
    put(FLOOR_FILE, JSON.stringify(record, null, 2) + '\n');
    put('app.js', 'export const x = 1;\n');
    g('add', '-A');
    g('commit', '-qm', 'base');
    const expect = (label, got, code) => { if (got.code !== code) problems.push(`${label}: exit ${got.code}, expected ${code} (${JSON.stringify(got.out)})`); };
    expect('check at a rate above the floor', run('check', 85), 0);
    expect('check at a rate equal to the floor', run('check', 80), 0);
    expect('check below the floor', run('check', 79), 1);
    expect('check when the measuring command fails', run('check', -1), 2);
    put('app.js', 'export const x = 2;\n');
    expect('approve with uncommitted tracked changes', run('approve', 70), 2);
    if (g('log', '--format=%s').trim().split('\n').length !== 1) problems.push('a refused approval still committed');
    g('checkout', '-q', '--', 'app.js');
    put('scratch.txt', 'untracked files are not part of the floor\n');
    expect('approve below the old floor (the owner resets it)', run('approve', 70), 0);
    const saved = JSON.parse(readFileSync(join(repo, FLOOR_FILE), 'utf8'));
    if (saved.ratchets.rate.value !== 70 || saved.ratchets.size.value !== 3) problems.push(`approve did not record the measured values: ${JSON.stringify(saved.ratchets)}`);
    const body = g('log', '-1', '--format=%B');
    if (!body.split('\n').some((l) => FLOOR_TRAILER.test(l))) problems.push('the approval commit lacks the trailer');
    if (!/rate: 80 -> 70/.test(body)) problems.push('the approval commit does not list the changed ratchet');
    const touched = g('show', '--name-only', '--format=', 'HEAD').trim();
    if (touched !== FLOOR_FILE) problems.push(`the approval commit touched more than ${FLOOR_FILE}: ${touched}`);
    expect('check at the new floor', run('check', 70), 0);
    expect('check below the new floor', run('check', 69), 1);
    const shown = run('show', 0);
    if (shown.code !== 0 || shown.out.commit !== g('rev-parse', 'HEAD').trim()) problems.push(`show does not name the approval commit: ${JSON.stringify(shown.out)}`);
    put(FLOOR_FILE, '{ "version": 1, "ratchets": { "bad": { "command": "node x" } } }\n');
    expect('check with a malformed ratchet', run('check', 85), 2);
    g('checkout', '-q', '--', FLOOR_FILE);
    // A repository without a record: check has nothing to hold; approve starts an empty one.
    rmSync(join(repo, FLOOR_FILE));
    g('commit', '-qam', 'drop the record');
    expect('check without a record', run('check', 85), 0);
    expect('approve without a record', run('approve', 85), 0);
    const fresh = JSON.parse(readFileSync(join(repo, FLOOR_FILE), 'utf8'));
    if (fresh.version !== 1 || Object.keys(fresh.ratchets).length !== 0) problems.push(`approve without a record should start an empty one: ${JSON.stringify(fresh)}`);
    expect('check outside a repository', run('check', 85, tmpdir()), 2);
  } catch (e) {
    problems.push(`selftest could not run: ${e.message}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`floor --selftest: ${problems.length} problem(s)`);
  finish(problems.length ? 'broken' : 'ok', { problems }, problems.length ? 1 : 0);
}

// Run as a command only when invoked directly, so the floor guard can import the constants above.
const main = Boolean(process.argv[1]) && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (main) {
  const cmd = process.argv[2];
  if (cmd === '--selftest') selftest();
  const root = cmd === 'check' && process.argv[3] === '--bundle'
    ? resolve(here, '../../../../..')
    : git(['rev-parse', '--show-toplevel'])?.trim();
  if (!root) fail('not inside a git work tree');
  if (cmd === 'show') show(root);
  else if (cmd === 'check') check(root);
  else if (cmd === 'approve') approve(root);
  else fail('usage: node floor.mjs show | check | approve | --selftest');
}
