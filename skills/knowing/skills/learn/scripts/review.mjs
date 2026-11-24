#!/usr/bin/env node
// Spaced practice for one learner: a Leitner schedule kept in <learner folder>/practice.md, one row per item.
// An item answered right moves up a box and comes back later (1, 2, 4, 8, 16 days); answered wrong, it goes back
// to box 1 and comes back tomorrow. The file is the record; this script only reads and rewrites it.
//
//   node review.mjs add --prompt "<question>" --answer "<answer>" [--topic <t>]
//   node review.mjs due [--limit 10]            items due today or earlier, lowest box first
//   node review.mjs record <id> right|wrong
//   node review.mjs stats
//   node review.mjs --selftest
// Options: --folder <dir> (default: the nearest folder at or above the current one holding knowing.md),
//          --today YYYY-MM-DD (for tests).
// Exit: 0 done, 1 a problem in the file (an unknown box or date), 2 couldn't run (no learner folder, bad arguments).
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const log = (s = '') => process.stderr.write(s + '\n');
export const INTERVALS = [1, 2, 4, 8, 16]; // days until the next review, by box 1..5
const COLUMNS = ['id', 'topic', 'prompt', 'answer', 'box', 'due', 'right', 'wrong'];

export function findFolder(start) {
  let d = resolve(start);
  for (;;) {
    if (existsSync(join(d, 'knowing.md'))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

const addDays = (date, n) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

export function parse(src) {
  const rows = [], problems = [];
  let header = null;
  for (const [i, line] of src.split(/\r?\n/).entries()) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
    if (!header) { header = cells; continue; }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const r = Object.fromEntries(header.map((h, j) => [h, cells[j] ?? '']));
    if (!/^[1-5]$/.test(r.box)) problems.push(`line ${i + 1}: box "${r.box}" is not 1 to 5`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.due)) problems.push(`line ${i + 1}: due "${r.due}" is not a date`);
    rows.push(r);
  }
  return { rows, problems };
}

export function render(rows) {
  return ['# Practice', '', 'Spaced practice, managed by `review.mjs`: box 1 comes back tomorrow, box 5 in 16 days.', '',
    `| ${COLUMNS.join(' | ')} |`, `|${COLUMNS.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${COLUMNS.map((c) => cell(r[c])).join(' | ')} |`), ''].join('\n');
}

export const due = (rows, today) => rows.filter((r) => r.due <= today).sort((a, b) => Number(a.box) - Number(b.box) || a.due.localeCompare(b.due));

export function record(row, result, today) {
  const box = result === 'right' ? Math.min(5, Number(row.box) + 1) : 1;
  row[result] = String(Number(row[result] || 0) + 1);
  row.box = String(box);
  row.due = addDays(today, INTERVALS[box - 1]);
  return row;
}

function parseArgs(argv) {
  const pos = [], opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--selftest') opts.selftest = true;
    else if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, opts };
}

export function run(argv, { cwd = process.cwd(), out = (s) => process.stdout.write(s + '\n'), err = log } = {}) {
  const { pos, opts } = parseArgs(argv);
  const folder = opts.folder ? resolve(cwd, opts.folder) : findFolder(cwd);
  if (!folder || !existsSync(join(folder, 'knowing.md'))) { err('No learner folder: no knowing.md here or above. Load the learn or tutor skill to set one up, or pass --folder.'); return 2; }
  const file = join(folder, 'practice.md');
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const { rows, problems } = existsSync(file) ? parse(readFileSync(file, 'utf8')) : { rows: [], problems: [] };
  const save = () => writeFileSync(file, render(rows));
  switch (pos[0]) {
    case 'add': {
      if (!opts.prompt || !opts.answer) { err('add needs --prompt and --answer'); return 2; }
      const id = String(Math.max(0, ...rows.map((r) => Number(r.id) || 0)) + 1);
      const row = { id, topic: opts.topic ?? '', prompt: opts.prompt, answer: opts.answer, box: '1', due: today, right: '0', wrong: '0' };
      rows.push(row);
      save();
      out(JSON.stringify({ status: 'added', row }));
      return 0;
    }
    case 'due': {
      const d = due(rows, today).slice(0, Number(opts.limit ?? 10));
      for (const r of d) err(`${r.id.padStart(3)}  box ${r.box}  ${r.prompt}`);
      out(JSON.stringify({ status: problems.length ? 'invalid' : 'ok', today, due: d, problems }));
      return problems.length ? 1 : 0;
    }
    case 'record': {
      const row = rows.find((r) => r.id === pos[1]);
      if (!row) { err(`No item with id ${pos[1]}`); return 2; }
      if (!['right', 'wrong'].includes(pos[2])) { err('record needs right or wrong'); return 2; }
      record(row, pos[2], today);
      save();
      out(JSON.stringify({ status: 'recorded', row }));
      return 0;
    }
    case 'stats': {
      const byBox = Object.fromEntries(INTERVALS.map((_, i) => [i + 1, rows.filter((r) => Number(r.box) === i + 1).length]));
      const d = due(rows, today).length;
      err(`${rows.length} item(s), ${d} due; by box: ${Object.entries(byBox).map(([b, n]) => `${b}:${n}`).join(' ')}`);
      out(JSON.stringify({ status: problems.length ? 'invalid' : 'ok', total: rows.length, due: d, byBox, problems }));
      return problems.length ? 1 : 0;
    }
    default:
      err('Usage: review.mjs add|due|record|stats [options]   (see the header of this file)');
      return 2;
  }
}

function selftest() {
  const problems = [];
  const tmp = mkdtempSync(join(tmpdir(), 'knowing-review-'));
  const outs = [];
  const call = (today, ...a) => run([...a, '--folder', tmp, '--today', today], { out: (s) => outs.push(JSON.parse(s)), err: () => {} });
  try {
    if (run(['due'], { cwd: tmp, out: () => {}, err: () => {} }) !== 2) problems.push('no learner folder must exit 2');
    writeFileSync(join(tmp, 'knowing.md'), '# Learner');
    call('2026-10-01', 'add', '--prompt', 'What does a move do? | pipes too', '--answer', 'Transfers ownership', '--topic', 'ownership');
    call('2026-10-01', 'add', '--prompt', 'Borrow rule?', '--answer', 'Many & or one &mut');
    call('2026-10-01', 'due');
    if (outs.at(-1).due.length !== 2) problems.push('new items must be due the day they are added');
    call('2026-10-01', 'record', '1', 'right');
    if (outs.at(-1).row.box !== '2' || outs.at(-1).row.due !== '2026-10-03') problems.push(`right answer: expected box 2 due 2026-10-03, got ${JSON.stringify(outs.at(-1).row)}`);
    call('2026-10-01', 'record', '2', 'wrong');
    if (outs.at(-1).row.box !== '1' || outs.at(-1).row.due !== '2026-10-02') problems.push('wrong answer: expected box 1 due tomorrow');
    call('2026-10-02', 'due');
    if (outs.at(-1).due.map((r) => r.id).join() !== '2') problems.push('on day 2 only item 2 is due');
    const back = parse(readFileSync(join(tmp, 'practice.md'), 'utf8'));
    if (back.rows[0].prompt !== 'What does a move do? | pipes too') problems.push('a pipe in a prompt must round-trip');
    let row = { box: '5', due: '2026-10-01', right: '0', wrong: '0' };
    record(row, 'right', '2026-10-01');
    if (row.box !== '5' || row.due !== '2026-10-17') problems.push('box 5 stays at 5 with a 16-day interval');
    if (call('2026-10-01', 'record', '1', 'maybe') !== 2) problems.push('an unknown result must exit 2');
    writeFileSync(join(tmp, 'practice.md'), readFileSync(join(tmp, 'practice.md'), 'utf8').replace('| 2 | 2026-10-03 |', '| 9 | soon |'));
    if (call('2026-10-01', 'stats') !== 1 || outs.at(-1).problems.length < 2) problems.push('a bad box and a bad date must be reported');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  log(`review --selftest: ${problems.length} problem(s)`);
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
