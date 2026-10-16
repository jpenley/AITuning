#!/usr/bin/env node
// The application tracker: one Markdown table in <workspace>/tracker.md, one row per posting that was evaluated.
// The file is the source of truth; this script only reads and rewrites it, so the model never counts rows itself.
//
//   node tracker.mjs add --company <c> --role <r> [--verdict apply|maybe|skip] [--source <url>] [--folder <path>]
//   node tracker.mjs set <id> [--status <s>] [--next "<date> <action>"] [--note "<text>"]
//   node tracker.mjs list [--status <s>[,<s>...]]
//   node tracker.mjs stale [--days 10]
//   node tracker.mjs stats
//   node tracker.mjs --selftest
// Options: --workspace <dir> (default: the nearest folder at or above the current one holding trajectory.md),
//          --today YYYY-MM-DD (for tests).
// Exit: 0 done, 1 a finding (stale rows, an invalid row in the file), 2 couldn't run (no workspace, bad arguments).
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const STATUSES = ['evaluated', 'skipped', 'applied', 'screening', 'interviewing', 'offer', 'accepted', 'declined', 'rejected', 'withdrawn', 'no-response'];
export const VERDICTS = ['apply', 'maybe', 'skip'];
const COLUMNS = ['id', 'company', 'role', 'verdict', 'status', 'found', 'updated', 'next', 'source', 'folder', 'note'];
// Where an application stands for calibration: did the fit verdict predict a response?
const OUTCOME = {
  screening: 'response', interviewing: 'response', offer: 'response', accepted: 'response', declined: 'response',
  rejected: 'no', 'no-response': 'no',
  applied: 'open',
};
const MIN_SAMPLE = 5; // rates on fewer resolved applications than this are withheld

const log = (s = '') => process.stderr.write(s + '\n');

export function findWorkspace(start) {
  let d = resolve(start);
  for (;;) {
    if (existsSync(join(d, 'trajectory.md'))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const uncell = (v) => v.replace(/\\\|/g, '|').trim();

export function parse(src) {
  const rows = [];
  const problems = [];
  let header = null;
  for (const [i, line] of src.split(/\r?\n/).entries()) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(uncell);
    if (!header) { header = cells; continue; }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const row = Object.fromEntries(header.map((h, j) => [h, cells[j] ?? '']));
    if (row.status && !STATUSES.includes(row.status)) problems.push(`line ${i + 1}: unknown status "${row.status}"`);
    if (row.verdict && !VERDICTS.includes(row.verdict)) problems.push(`line ${i + 1}: unknown verdict "${row.verdict}"`);
    rows.push(row);
  }
  return { rows, problems };
}

export function render(rows) {
  const lines = ['# Applications', '', 'Managed by the `track` skill\'s `tracker.mjs`; edit by hand if you like, keeping the columns and the status words.', ''];
  lines.push(`| ${COLUMNS.join(' | ')} |`, `|${COLUMNS.map(() => '---').join('|')}|`);
  for (const r of rows) lines.push(`| ${COLUMNS.map((c) => cell(r[c])).join(' | ')} |`);
  return lines.join('\n') + '\n';
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function stale(rows, today, days) {
  return rows.filter((r) => ['applied', 'screening', 'interviewing'].includes(r.status) && r.updated && daysBetween(r.updated, today) >= days);
}

export function stats(rows) {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of rows) if (r.status in byStatus) byStatus[r.status]++;
  const calibration = {};
  for (const v of VERDICTS) {
    const applied = rows.filter((r) => r.verdict === v && OUTCOME[r.status]);
    const resolved = applied.filter((r) => OUTCOME[r.status] !== 'open');
    const responses = resolved.filter((r) => OUTCOME[r.status] === 'response').length;
    calibration[v] = {
      applied: applied.length,
      resolved: resolved.length,
      responses,
      responseRate: resolved.length >= MIN_SAMPLE ? Math.round((100 * responses) / resolved.length) : null,
      note: resolved.length >= MIN_SAMPLE ? '' : `withheld: ${resolved.length} resolved, need ${MIN_SAMPLE}`,
    };
  }
  return { total: rows.length, byStatus, calibration };
}

function args(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (k === 'selftest') opts.selftest = true;
      else if (i + 1 < argv.length) opts[k] = argv[++i];
      else throw new Error(`${a} needs a value`);
    } else pos.push(a);
  }
  return { pos, opts };
}

export function run(argv, { cwd = process.cwd(), out = (s) => process.stdout.write(s + '\n'), err = log } = {}) {
  let parsed;
  try { parsed = args(argv); } catch (e) { err(e.message); return 2; }
  const { pos, opts } = parsed;
  const cmd = pos[0];
  const ws = opts.workspace ? resolve(cwd, opts.workspace) : findWorkspace(cwd);
  if (!ws || !existsSync(join(ws, 'trajectory.md'))) { err('No trajectory workspace: no trajectory.md here or above. Load the profile skill to create one, or pass --workspace.'); return 2; }
  const file = join(ws, 'tracker.md');
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const { rows, problems } = existsSync(file) ? parse(readFileSync(file, 'utf8')) : { rows: [], problems: [] };
  const save = () => writeFileSync(file, render(rows));

  switch (cmd) {
    case 'add': {
      if (!opts.company || !opts.role) { err('add needs --company and --role'); return 2; }
      const verdict = opts.verdict ?? '';
      if (verdict && !VERDICTS.includes(verdict)) { err(`--verdict must be one of ${VERDICTS.join(', ')}`); return 2; }
      const dup = rows.find((r) => (opts.source && r.source === opts.source) || (r.company.toLowerCase() === opts.company.toLowerCase() && r.role.toLowerCase() === opts.role.toLowerCase()));
      if (dup) { err(`Already tracked as ${dup.id} (${dup.company}, ${dup.role}, ${dup.status}). Use set to update it.`); out(JSON.stringify({ status: 'duplicate', row: dup })); return 1; }
      const id = String(Math.max(0, ...rows.map((r) => Number(r.id) || 0)) + 1);
      const row = { id, company: opts.company, role: opts.role, verdict, status: verdict === 'skip' ? 'skipped' : 'evaluated', found: today, updated: today, next: opts.next ?? '', source: opts.source ?? '', folder: opts.folder ?? '', note: opts.note ?? '' };
      rows.push(row);
      save();
      out(JSON.stringify({ status: 'added', row }));
      return 0;
    }
    case 'set': {
      const row = rows.find((r) => r.id === pos[1]);
      if (!row) { err(`No row with id ${pos[1]}`); return 2; }
      if (opts.status && !STATUSES.includes(opts.status)) { err(`--status must be one of ${STATUSES.join(', ')}`); return 2; }
      if (opts.verdict && !VERDICTS.includes(opts.verdict)) { err(`--verdict must be one of ${VERDICTS.join(', ')}`); return 2; }
      for (const k of ['status', 'verdict', 'next', 'note', 'folder', 'source']) if (opts[k] !== undefined) row[k] = opts[k];
      row.updated = today;
      save();
      out(JSON.stringify({ status: 'updated', row }));
      return 0;
    }
    case 'list': {
      const want = opts.status ? opts.status.split(',') : null;
      const sel = want ? rows.filter((r) => want.includes(r.status)) : rows;
      for (const r of sel) err(`${r.id.padStart(3)}  ${r.status.padEnd(12)} ${r.company}, ${r.role}${r.next ? `  (next: ${r.next})` : ''}`);
      out(JSON.stringify({ status: problems.length ? 'invalid' : 'ok', rows: sel, problems }));
      return problems.length ? 1 : 0;
    }
    case 'stale': {
      const days = Number(opts.days ?? 10);
      const s = stale(rows, today, days);
      for (const r of s) err(`${r.id.padStart(3)}  ${r.status} since ${r.updated} (${daysBetween(r.updated, today)} days): ${r.company}, ${r.role}`);
      out(JSON.stringify({ status: s.length ? 'stale' : 'ok', days, rows: s }));
      return s.length ? 1 : 0;
    }
    case 'stats': {
      const st = stats(rows);
      err(`${st.total} tracked. Response rate by fit verdict (screening or later counts as a response):`);
      for (const [v, c] of Object.entries(st.calibration)) err(`  ${v.padEnd(6)} applied ${c.applied}, resolved ${c.resolved}, responses ${c.responses}, rate ${c.responseRate ?? c.note}`);
      out(JSON.stringify({ status: problems.length ? 'invalid' : 'ok', ...st, problems }));
      return problems.length ? 1 : 0;
    }
    default:
      err('Usage: tracker.mjs add|set|list|stale|stats [options]   (see the header of this file)');
      return 2;
  }
}

function selftest() {
  const problems = [];
  const tmp = mkdtempSync(join(tmpdir(), 'trajectory-tracker-'));
  const quiet = () => {};
  const outs = [];
  const call = (...a) => run([...a, '--workspace', tmp, '--today', '2026-10-01'], { out: (s) => outs.push(JSON.parse(s)), err: quiet });
  try {
    if (run(['list'], { cwd: tmp, out: quiet, err: quiet }) !== 2) problems.push('no workspace must exit 2');
    writeFileSync(join(tmp, 'trajectory.md'), '# workspace');
    if (call('add', '--company', 'Acme | Co', '--role', 'Data Engineer', '--verdict', 'apply') !== 0) problems.push('add failed');
    if (call('add', '--company', 'acme | co', '--role', 'data engineer') !== 1) problems.push('a duplicate must be refused');
    if (call('add', '--company', 'B', '--role', 'R', '--verdict', 'yes') !== 2) problems.push('an unknown verdict must exit 2');
    call('add', '--company', 'Skipco', '--role', 'R', '--verdict', 'skip');
    const back = parse(readFileSync(join(tmp, 'tracker.md'), 'utf8'));
    if (back.rows[0]?.company !== 'Acme | Co') problems.push('a pipe in a cell must round-trip');
    if (back.rows[1]?.status !== 'skipped') problems.push('a skip verdict must start as skipped');
    if (call('set', '1', '--status', 'sent') !== 2) problems.push('an unknown status must exit 2');
    run(['set', '1', '--status', 'applied', '--workspace', tmp, '--today', '2026-09-01'], { out: quiet, err: quiet });
    if (call('stale', '--days', '10') !== 1 || outs.at(-1).rows[0]?.id !== '1') problems.push('an applied row untouched for 30 days must be stale');
    if (call('stale', '--days', '40') !== 0) problems.push('a row inside the window must not be stale');
    for (let i = 0; i < 6; i++) { call('add', '--company', `C${i}`, '--role', 'R', '--verdict', 'maybe'); call('set', outs.at(-1).row.id, '--status', i < 2 ? 'screening' : 'rejected'); }
    call('stats');
    const cal = outs.at(-1).calibration;
    if (cal.maybe.responseRate !== 33 || cal.maybe.resolved !== 6) problems.push(`calibration rate wrong: ${JSON.stringify(cal.maybe)}`);
    if (cal.apply.responseRate !== null || !cal.apply.note.startsWith('withheld')) problems.push('a rate on too few resolved applications must be withheld');
    writeFileSync(join(tmp, 'tracker.md'), readFileSync(join(tmp, 'tracker.md'), 'utf8').replace('| rejected |', '| ghosted |'));
    if (call('list') !== 1 || !outs.at(-1).problems.length) problems.push('an unknown status in the file must be reported');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  log(`tracker --selftest: ${problems.length} problem(s)`);
  for (const p of problems) log(`  - ${p}`);
  process.stdout.write(JSON.stringify({ status: problems.length ? 'fail' : 'ok', problems }) + '\n');
  process.exit(problems.length ? 1 : 0);
}

// Real paths on both sides: run through a symlink or junction (how Codex and opencode install skills), argv[1]
// keeps the link path while import.meta.url is the real one.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  if (process.argv.includes('--selftest')) selftest();
  else process.exit(run(process.argv.slice(2)));
}
