#!/usr/bin/env node
// Trends over Tier 3 results and over an optimize attempt log. Deterministic: no LLM calls, no network.
//
//   node trends.mjs [--results <dir>] [--html <out.html>]
//       every <dir>/behave-*/results.json (default: results/ beside this script): per case/target, the
//       with/without scores and delta per run in time order, per-grader pass rates, skill files changed
//       between runs (from git, when available), and regressions.
//   node trends.mjs --attempts <log.md> [--direction lower|higher] [--target <n>] [--html <out.html>]
//       an optimize attempt log (a markdown table): keep/revert rate, cumulative improvement, plateaus,
//       biggest win; the analysis depends on the columns present (idea after uditgoenka/autoresearch's evals).
//   node trends.mjs --selftest
//       plants faults in throwaway fixtures and fails unless each is caught.
//
// Exit: 0 no regression, 1 a regression flagged, 2 could not run. stdout: one JSON object; stderr: report.
//
// A regression is flagged only against the spread the history shows: with fewer than MIN_RUNS complete runs
// the verdict is "too few runs", never a guessed threshold. A judge error decided nothing: it is left out of
// every rate and shown beside it, never counted as a fail.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { finish } from './lib/skills.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MIN_RUNS = 3; // two earlier runs to see a spread, one to compare against it
const EPS = 1e-9;
const PLATEAU = 3; // attempts in a row with no win (the optimize skill's plateau rule)

const log = (s = '') => process.stderr.write(s + '\n');
class CannotRun extends Error {}

// ---------- arguments ----------

function parseArgs(argv) {
  const takes = new Set(['--results', '--attempts', '--html', '--direction', '--target']);
  const flags = new Set(['--selftest']);
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (flags.has(a)) o[a.slice(2)] = true;
    else if (takes.has(a)) {
      const v = argv[++i];
      if (v == null || v.startsWith('--')) throw new CannotRun(`${a} needs a value`);
      o[a.slice(2)] = v;
    } else throw new CannotRun(`unknown argument ${a}`);
  }
  if (o.direction && !['lower', 'higher'].includes(o.direction)) throw new CannotRun('--direction must be lower or higher');
  if (o.target != null) {
    o.target = Number(o.target);
    if (!Number.isFinite(o.target)) throw new CannotRun('--target must be a number');
  }
  if (o.attempts && o.results) throw new CannotRun('give --attempts or --results, not both');
  return o;
}

// ---------- behave results ----------

const stampTime = (stamp) => Date.parse(String(stamp).replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, 'T$1:$2:$3.$4Z'));
const shortTime = (t) => new Date(t).toISOString().slice(5, 16).replace('T', ' ') + 'Z';

export function loadRuns(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new CannotRun(`no results folder at ${dir}`);
  const runs = [];
  const skipped = [];
  for (const name of readdirSync(dir).filter((n) => n.startsWith('behave-')).sort()) {
    const file = join(dir, name, 'results.json');
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (data.mode === 'routing') continue;
      const stamp = data.stamp ?? name.slice('behave-'.length);
      const time = stampTime(stamp);
      if (!Number.isFinite(time)) throw new Error(`unreadable stamp ${stamp}`);
      if (!Array.isArray(data.rows) && !Array.isArray(data.summary)) throw new Error('no rows or summary');
      runs.push({ name, stamp, time, data });
    } catch (e) {
      skipped.push({ run: name, why: e.message });
    }
  }
  if (!runs.length) throw new CannotRun(`no readable behave-*/results.json under ${dir}${skipped.length ? ` (${skipped.length} unreadable)` : ''}`);
  runs.sort((a, b) => a.time - b.time);
  return { runs, skipped };
}

const ARMS = ['with', 'without'];
const decidedRate = (c) => (c && c.passed + c.failed ? c.passed / (c.passed + c.failed) : null);

// One case/target in one run, recomputed from the per-session rows so every run is scored the same way:
// score per arm = pass rate over decided grades that apply to both arms (as behave.mjs scores it).
function pairFromRows(rows) {
  const valid = rows.filter((r) => !r.invalid);
  const reasons = [];
  const invalid = rows.length - valid.length;
  if (invalid) reasons.push(`${invalid} invalid session(s)`);
  if (rows.some((r) => (r.warnings ?? []).some((w) => String(w).startsWith('error:') || w === 'timed out'))) reasons.push('a session errored or timed out');
  if (rows.some((r) => (r.grades ?? []).some((g) => g.status === 'skip' && g.why === '--no-judge'))) reasons.push('judge off');
  const score = {};
  const judgeErrors = {};
  for (const a of ARMS) {
    const gs = valid.filter((r) => r.arm === a).flatMap((r) => (r.grades ?? []).filter((g) => g.arm === 'both'));
    const passed = gs.filter((g) => g.status === 'pass').length;
    const failed = gs.filter((g) => g.status === 'fail').length;
    score[a] = passed + failed ? passed / (passed + failed) : null;
    judgeErrors[a] = gs.filter((g) => g.status === 'error').length;
  }
  if (!valid.some((r) => r.arm === 'with')) reasons.push('no valid with-arm session');
  const graders = {};
  for (const r of valid) {
    if (!ARMS.includes(r.arm)) continue;
    for (const g of r.grades ?? []) {
      const c = ((graders[g.id] ??= {})[r.arm] ??= { passed: 0, failed: 0, errors: 0 });
      if (g.status === 'pass') c.passed++;
      else if (g.status === 'fail') c.failed++;
      else if (g.status === 'error') c.errors++;
    }
  }
  return { with: score.with, without: score.without, judgeErrors, graders, complete: !reasons.length, reasons, sessions: rows.length };
}

// Older or trimmed results without rows: fall back to the summary's numbers.
function pairFromSummary(s) {
  const reasons = [];
  if (s.invalid) reasons.push(`${s.invalid} invalid session(s)`);
  if (s.with == null) reasons.push('no with-arm score');
  const graders = {};
  for (const g of s.graders ?? []) {
    for (const a of ARMS) {
      if (!g[a]) continue;
      (graders[g.id] ??= {})[a] = { passed: g[a].passed, failed: g[a].of - g[a].passed, errors: g[a].errors ?? 0 };
    }
  }
  return { with: s.with, without: s.without, judgeErrors: {}, graders, complete: !reasons.length, reasons, sessions: null };
}

// The latest value against the history before it. For each run k (from the third on), the baseline is the
// runs before k; run k regressed if it sits below the baseline's best by more than the baseline's spread.
// The regression stands if the latest run is still that far below the same baseline; otherwise it is a
// recovered drop (reported, not flagged).
export function checkSeries(pts) {
  if (pts.length < MIN_RUNS) return { status: 'too few runs', runs: pts.length, need: MIN_RUNS };
  const last = pts.at(-1);
  const recovered = [];
  for (let k = MIN_RUNS - 1; k < pts.length; k++) {
    const base = pts.slice(0, k).map((p) => p.v);
    const best = Math.max(...base);
    const spread = best - Math.min(...base);
    if (best - pts[k].v <= spread + EPS) continue;
    if (best - last.v > spread + EPS) {
      return { status: 'regression', runs: pts.length, since: pts[k].stamp, latest: last.v, best, spread, drop: best - last.v, recovered };
    }
    recovered.push({ stamp: pts[k].stamp, value: pts[k].v, best, spread });
  }
  const base = pts.slice(0, -1).map((p) => p.v);
  return { status: 'ok', runs: pts.length, latest: last.v, best: Math.max(...base), spread: Math.max(...base) - Math.min(...base), recovered };
}

// Commits touching skills/, oldest first, or null outside git. One git call for the whole history.
function skillCommits(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'log', '--reverse', '--format=%x01%H%x09%cI', '--name-only', '--', 'skills/'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    return out.split('\x01').filter((c) => c.trim()).map((c) => {
      const [head, ...files] = c.split('\n');
      const [hash, date] = head.split('\t');
      return { hash: hash.slice(0, 7), time: Date.parse(date), files: files.map((f) => f.trim()).filter(Boolean) };
    });
  } catch {
    return null;
  }
}

export function analyzeBehave(runs, commits) {
  const byPair = new Map();
  for (const run of runs) {
    const rows = Array.isArray(run.data.rows) ? run.data.rows : null;
    const keys = new Set();
    if (rows) for (const r of rows) keys.add(`${r.case}|${r.target}`);
    else for (const s of run.data.summary) keys.add(`${s.case}|${s.target}`);
    for (const key of keys) {
      const [c, t] = key.split('|');
      const p = rows
        ? pairFromRows(rows.filter((r) => r.case === c && r.target === t))
        : pairFromSummary(run.data.summary.find((s) => s.case === c && s.target === t));
      if (!byPair.has(key)) byPair.set(key, { case: c, target: t, runs: [] });
      byPair.get(key).runs.push({ stamp: run.stamp, time: run.time, ...p, delta: p.with != null && p.without != null ? p.with - p.without : null });
    }
  }
  const pairs = [...byPair.values()].sort((a, b) => a.case.localeCompare(b.case) || a.target.localeCompare(b.target));
  const regressions = [];
  for (const pair of pairs) {
    pair.runs.forEach((r, i) => {
      if (!commits || i === 0) return;
      const prev = pair.runs[i - 1].time;
      const hits = commits.filter((c) => c.time > prev && c.time <= r.time);
      r.skillsChanged = [...new Set(hits.flatMap((c) => c.files))].sort();
      r.skillCommits = hits.map((c) => c.hash);
    });
    const complete = pair.runs.filter((r) => r.complete && r.with != null);
    pair.trend = checkSeries(complete.map((r) => ({ stamp: r.stamp, v: r.with })));
    // Runs scored by different graders (the case was edited) compare less directly: say so beside the verdict.
    pair.trend.graderSetChanged = new Set(complete.map((r) => Object.keys(r.graders).sort().join())).size > 1;
    if (pair.trend.status === 'regression') regressions.push({ case: pair.case, target: pair.target, what: 'with score', ...pair.trend });
    const ids = [...new Set(pair.runs.flatMap((r) => Object.keys(r.graders)))].sort();
    pair.graders = ids.map((id) => {
      const pts = complete.map((r) => ({ stamp: r.stamp, v: decidedRate(r.graders[id]?.with) })).filter((p) => p.v != null);
      const trend = checkSeries(pts);
      if (trend.status === 'regression') regressions.push({ case: pair.case, target: pair.target, what: `grader ${id} (with arm)`, ...trend });
      return { id, trend };
    });
  }
  return { pairs, regressions };
}

const f2 = (x) => (x == null ? '  -  ' : x.toFixed(2));
const sgn = (x) => (x == null ? '   -  ' : (x >= 0 ? '+' : '') + x.toFixed(2));
const cell = (c) => (!c || !(c.passed + c.failed + c.errors) ? '-' : `${c.passed}/${c.passed + c.failed}${c.errors ? `+${c.errors}e` : ''}`);

function trendText(t) {
  const caveat = t.graderSetChanged ? '; the grader set changed between runs' : '';
  if (t.status === 'too few runs') return `too few runs (${t.runs} complete, need ${t.need})`;
  const base = `latest ${t.latest.toFixed(2)}, best before ${t.best.toFixed(2)}, spread ${t.spread.toFixed(2)}`;
  if (t.status === 'regression') return `REGRESSION since ${shortTime(stampTime(t.since))}: ${base}, drop ${t.drop.toFixed(2)}${caveat}`;
  return `ok (${base}${t.recovered.length ? `; ${t.recovered.length} earlier drop(s) recovered` : ''}${caveat})`;
}

function reportBehave({ pairs, regressions }, meta) {
  log(`trends: ${meta.runs} run(s) in ${meta.dir}${meta.skipped.length ? `, ${meta.skipped.length} unreadable skipped` : ''}${meta.git ? '' : '; not a git checkout, skill changes not shown'}`);
  log('complete = a with arm scored, no invalid or errored sessions, judge on; judge errors are undecided (shown as +Ne), never fails');
  for (const p of pairs) {
    log(`\n${p.case} / ${p.target}  ${p.runs.length} run(s), ${p.runs.filter((r) => r.complete).length} complete`);
    log(`  with score: ${trendText(p.trend)}`);
    log('  run (UTC)          with  without  delta');
    for (const r of p.runs) {
      const notes = [];
      if (!r.complete) notes.push(`incomplete: ${r.reasons.join(', ')}`);
      const je = (r.judgeErrors.with ?? 0) + (r.judgeErrors.without ?? 0);
      if (je) notes.push(`${je} judge error(s) undecided`);
      if (r.skillsChanged?.length) notes.push(`skills changed: ${r.skillsChanged.slice(0, 4).map((f) => f.replace(/^skills\//, '')).join(', ')}${r.skillsChanged.length > 4 ? `, +${r.skillsChanged.length - 4} more` : ''}`);
      log(`  ${shortTime(r.time).padEnd(17)}  ${f2(r.with)}  ${f2(r.without)}   ${sgn(r.delta)}${notes.length ? `   ${notes.join('; ')}` : ''}`);
    }
    log('  graders, with arm, per run oldest first (passed/decided, +Ne judge errors):');
    for (const g of p.graders) {
      const cells = p.runs.map((r) => cell(r.graders[g.id]?.with)).join(' ');
      log(`    ${g.id.padEnd(26)} ${cells}${g.trend.status === 'regression' ? `   ${trendText(g.trend)}` : ''}`);
    }
  }
  log(`\n${pairs.length} case/target pair(s), ${regressions.length} regression(s)${regressions.length ? ':' : ''}`);
  for (const r of regressions) log(`  ${r.case} / ${r.target}: ${r.what} ${r.latest.toFixed(2)} vs best ${r.best.toFixed(2)} (spread ${r.spread.toFixed(2)})${r.graderSetChanged ? ', grader set changed between runs' : ''}`);
}

// ---------- attempt log ----------

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

function parseTables(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const tables = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    const sep = splitRow(lines[i + 1]);
    if (!sep.length || !sep.every((c) => /^:?-{1,}:?$/.test(c))) continue;
    const header = splitRow(lines[i]);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) rows.push(splitRow(lines[j]));
    tables.push({ header, rows, line: i + 1 });
    i = j - 1;
  }
  return tables;
}

// Column roles by header name (units in parentheses are ignored). First match wins, in this order.
const ROLES = [
  ['outcome', /^(outcome|status|decision|verdict|result)$/],
  ['attempt', /^(#|n|no\.?|attempt|iter|iteration|id|step)$/],
  ['family', /^(family|technique|category|kind)$/],
  ['mechanism', /^mechanism/],
  ['idea', /^(idea|change|hypothesis|description|what|attempt idea)$/],
  ['before', /^(before|baseline)$/],
  ['after', /^(after|measured|metric|candidate)$/],
  ['noise', /^(noise|spread|±|stdev|sd)$/],
  ['adds', /^(adds|complexity)/],
];
const REQUIRED = ['before', 'after', 'outcome'];

function mapColumns(header) {
  const cols = {};
  header.forEach((h, i) => {
    const name = h.toLowerCase().replace(/[*`_]/g, '').replace(/\(.*?\)|\[.*?\]/g, '').trim();
    for (const [role, re] of ROLES) if (!(role in cols) && re.test(name)) { cols[role] = i; break; }
  });
  return cols;
}

export function parseNumber(text) {
  if (text == null) return null;
  const s = String(text).replace(/[*`~≈]/g, '').replace(/(\d),(?=\d{3}\b)/g, '$1');
  const m = s.match(/(-?\d+(?:\.\d+)?)(?:\s*(?:–|—|\.\.|to|-)\s*(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  const a = Number(m[1]);
  return m[2] != null ? (a + Number(m[2])) / 2 : a;
}

export function normaliseOutcome(text, idea) {
  const o = String(text ?? '').toLowerCase().replace(/[*`]/g, '').trim();
  if (/^(not|never|did not|was not|unkept)\b/.test(o)) return 'unknown';
  if (/^(kept|keep|win|won|accepted?)\b/.test(o)) return 'kept';
  if (/^(crash|timeout|timed out)/.test(o)) return 'crash';
  if (/^(revert|discard|reject|flat|worse|changed output)/.test(o)) return /crash|timeout|timed out/.test(o) ? 'crash' : 'reverted';
  if (/^baseline/.test(o) || (/^[-–—]?$/.test(o) && /baseline/i.test(idea ?? ''))) return 'baseline';
  if (/crash|timeout|timed out/.test(o)) return 'crash';
  if (/revert|discard|reject/.test(o)) return 'reverted';
  if (/\bkept\b|\bkeep\b/.test(o)) return 'kept';
  return 'unknown';
}

export function analyzeAttempts(md, opts = {}) {
  const tables = parseTables(md);
  if (!tables.length) throw new CannotRun('no markdown table found');
  const found = tables.map((t) => ({ t, cols: mapColumns(t.header) }));
  const hit = found.find(({ cols }) => REQUIRED.every((r) => r in cols) && ('attempt' in cols || 'idea' in cols));
  if (!hit) {
    const best = found[0];
    const missing = [...REQUIRED, 'attempt or idea'].filter((r) => (r === 'attempt or idea' ? !('attempt' in best.cols || 'idea' in best.cols) : !(r in best.cols)));
    throw new CannotRun(`no table has the columns needed; the first (line ${best.t.line}: ${best.t.header.join(' | ')}) lacks ${missing.join(', ')}`);
  }
  const { t, cols } = hit;
  const get = (row, role) => (role in cols ? row[cols[role]] ?? '' : undefined);
  const all = t.rows.map((row, i) => {
    const idea = get(row, 'idea');
    return {
      n: get(row, 'attempt') ?? String(i),
      idea: idea ?? '',
      family: get(row, 'family') ?? null,
      before: parseNumber(get(row, 'before')),
      after: parseNumber(get(row, 'after')),
      outcome: normaliseOutcome(get(row, 'outcome'), idea),
      raw: get(row, 'outcome'),
    };
  });
  const baseRow = all.find((a) => a.outcome === 'baseline');
  const attempts = all.filter((a) => a.outcome !== 'baseline');
  if (!attempts.length) throw new CannotRun('the attempt log has no attempts yet');
  const baseline = baseRow ? baseRow.before ?? baseRow.after : attempts.find((a) => a.before != null)?.before ?? null;
  if (baseline == null) throw new CannotRun('no baseline number: add a baseline row or a before value on the first attempt');

  // Direction: given, else from what the kept attempts did, else lower (optimize metrics are usually costs).
  let direction = opts.direction;
  let directionWhy = 'given';
  if (!direction) {
    const kept = attempts.filter((a) => a.outcome === 'kept' && a.before != null && a.after != null && a.before !== a.after);
    const down = kept.filter((a) => a.after < a.before).length;
    direction = down * 2 >= kept.length ? 'lower' : 'higher';
    directionWhy = kept.length ? `inferred from ${kept.length} kept attempt(s)` : 'default (no kept attempts to infer from)';
  }
  const better = (a, b) => (direction === 'lower' ? a < b : a > b);
  const gain = (from, to) => (direction === 'lower' ? from / to : to / from); // >1 is an improvement

  let best = baseline;
  const kept = [];
  const keptWorse = [];
  const unknown = [];
  const series = [];
  for (const a of attempts) {
    if (a.outcome === 'unknown') unknown.push(a.n);
    if (a.outcome === 'kept') {
      const from = a.before ?? best;
      if (a.after != null) {
        if (!better(a.after, from)) keptWorse.push({ attempt: a.n, before: from, after: a.after });
        else kept.push({ attempt: a.n, idea: a.idea, before: from, after: a.after, gain: gain(from, a.after) });
        if (better(a.after, best)) best = a.after;
      }
    }
    series.push({ attempt: a.n, value: a.after, outcome: a.outcome, best });
  }

  // Plateaus: PLATEAU or more attempts in a row that were not kept wins.
  const plateaus = [];
  let run = [];
  const close = () => { if (run.length >= PLATEAU) plateaus.push({ from: run[0].n, to: run.at(-1).n, length: run.length }); run = []; };
  for (const a of attempts) {
    if (a.outcome === 'kept' && !keptWorse.some((k) => k.attempt === a.n)) close();
    else run.push(a);
  }
  const current = run.length >= PLATEAU;
  close();

  const count = (o) => attempts.filter((a) => a.outcome === o).length;
  const byFamily = 'family' in cols
    ? Object.values(attempts.reduce((m, a) => {
      const k = a.family || '(none)';
      const e = (m[k] ??= { family: k, attempts: 0, kept: 0 });
      e.attempts++;
      if (a.outcome === 'kept') e.kept++;
      return m;
    }, {}))
    : null;
  const biggest = kept.reduce((m, k) => (!m || k.gain > m.gain ? k : m), null);
  const compounded = kept.reduce((p, k) => p * k.gain, 1);
  const res = {
    columns: Object.fromEntries(Object.entries(cols).map(([r, i]) => [r, t.header[i]])),
    direction, directionWhy,
    attempts: attempts.length,
    counts: { kept: count('kept'), reverted: count('reverted'), crash: count('crash'), unknown: count('unknown') },
    keepRate: count('kept') / attempts.length,
    revertRate: count('reverted') / attempts.length,
    baseline, best,
    improvement: { factor: gain(baseline, best), percent: direction === 'lower' ? (baseline - best) / baseline * 100 : (best - baseline) / baseline * 100, compoundedFactor: compounded },
    biggestWin: biggest,
    plateaus, inPlateau: current,
    keptWorse, unknownOutcomes: unknown,
    byFamily,
    target: opts.target ?? null,
    targetMet: opts.target == null ? null : !better(opts.target, best),
    series,
  };
  return res;
}

function reportAttempts(a, file) {
  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  log(`trends: attempt log ${file}`);
  log(`  columns: ${Object.entries(a.columns).map(([r, h]) => `${r}="${h}"`).join(', ')}`);
  log(`  direction: ${a.direction} is better (${a.directionWhy})`);
  log(`  attempts: ${a.attempts}  kept ${a.counts.kept} (${pct(a.keepRate)})  reverted ${a.counts.reverted} (${pct(a.revertRate)})  crash ${a.counts.crash}${a.counts.unknown ? `  unreadable outcome ${a.counts.unknown} (${a.unknownOutcomes.join(', ')})` : ''}`);
  log(`  baseline ${a.baseline} -> best ${a.best}: ${a.improvement.factor.toFixed(2)}x (${a.improvement.percent.toFixed(1)}%); kept wins compounded ${a.improvement.compoundedFactor.toFixed(2)}x${Math.abs(Math.log(a.improvement.compoundedFactor / a.improvement.factor)) > 0.1 ? '  (differs from baseline->best: check each kept row measures against the previous best)' : ''}`);
  if (a.biggestWin) log(`  biggest win: #${a.biggestWin.attempt} ${a.biggestWin.before} -> ${a.biggestWin.after} (${a.biggestWin.gain.toFixed(2)}x)${a.biggestWin.idea ? `: ${a.biggestWin.idea}` : ''}`);
  if (a.byFamily) log(`  by family: ${a.byFamily.map((f) => `${f.family} ${f.kept}/${f.attempts}`).join(', ')}`);
  if (a.plateaus.length) log(`  plateau(s), ${PLATEAU}+ attempts in a row with no win: ${a.plateaus.map((p) => `#${p.from}..#${p.to} (${p.length})`).join(', ')}${a.inPlateau ? '  <- the log ends in one: switch family or combine near-misses' : ''}`);
  else log(`  no plateau (${PLATEAU}+ attempts in a row with no win)`);
  if (a.target != null) log(`  target ${a.target}: ${a.targetMet ? 'met' : 'not met'}`);
  if (a.keptWorse.length) log(`  REGRESSION: kept attempt(s) not better than their before: ${a.keptWorse.map((k) => `#${k.attempt} ${k.before} -> ${k.after}`).join(', ')}`);
}

// ---------- HTML ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x) => (Number.isInteger(x) ? String(x) : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2).replace(/\.?0+$/, '') || '0');

const W = 640, H = 260, M = { l: 56, r: 20, t: 16, b: 36 };

function axes(xTicks, yTicks, xLabel, yLabel, w = W, h = H) {
  const x0 = M.l, x1 = w - M.r, y0 = h - M.b, y1 = M.t;
  let s = `<line class="ax" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/><line class="ax" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}"/>`;
  for (const t of yTicks) s += `<line class="grid" x1="${x0}" y1="${t.y}" x2="${x1}" y2="${t.y}"/><text class="tick" x="${x0 - 6}" y="${t.y + 4}" text-anchor="end">${esc(t.label)}</text>`;
  for (const t of xTicks) s += `<line class="ax" x1="${t.x}" y1="${y0}" x2="${t.x}" y2="${y0 + 4}"/><text class="tick" x="${t.x}" y="${y0 + 16}" text-anchor="middle">${esc(t.label)}</text>`;
  s += `<text class="lab" x="${(x0 + x1) / 2}" y="${h - 4}" text-anchor="middle">${esc(xLabel)}</text>`;
  s += `<text class="lab" transform="translate(12 ${(y0 + y1) / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
  return s;
}

const marker = {
  circle: (x, y, cls) => `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>`,
  box: (x, y, cls) => `<rect class="${cls} open" x="${(x - 6).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="12" height="12"/>`,
  cross: (x, y, cls) => `<path class="${cls} x" d="M${x - 4.5} ${y - 4.5}L${x + 4.5} ${y + 4.5}M${x - 4.5} ${y + 4.5}L${x + 4.5} ${y - 4.5}"/>`,
};

function xScale(n, w = W) {
  const x0 = M.l + 12, x1 = w - M.r - 12;
  return (i) => (n <= 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1));
}

const BW = 440, BH = 210; // behave cards sit two across, so a smaller canvas keeps the text legible

function behaveChart(p) {
  const n = p.runs.length;
  const sx = xScale(n, BW);
  const sy = (v) => BH - M.b - v * (BH - M.b - M.t);
  const yTicks = [0, 0.5, 1].map((v) => ({ y: sy(v), label: num(v) }));
  const xTicks = n === 1 ? [{ x: sx(0), label: '1' }] : [{ x: sx(0), label: '1' }, { x: sx(n - 1), label: String(n) }];
  let s = axes(xTicks, yTicks, 'run (oldest to newest)', 'score', BW, BH);
  for (const [arm, cls, shape] of [['without', 'wo', 'box'], ['with', 'w', 'circle']]) {
    const pts = p.runs.map((r, i) => (r[arm] == null ? null : { x: sx(i), y: sy(r[arm]), faded: !r.complete }));
    const segs = [];
    let cur = [];
    for (const q of pts) { if (q) cur.push(q); else { if (cur.length) segs.push(cur); cur = []; } }
    if (cur.length) segs.push(cur);
    for (const seg of segs) if (seg.length > 1) s += `<polyline class="${cls} line" points="${seg.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}"/>`;
    for (const q of pts) if (q) s += marker[shape](q.x, q.y, cls + (q.faded ? ' faded' : ''));
  }
  const title = `${p.case} / ${p.target}: with and without scores over ${n} run(s)`;
  return `<svg viewBox="0 0 ${BW} ${BH}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${s}</svg>`;
}

// Round axis ends outward to a nice step, so the end numbers read cleanly.
function niceLinear(lo, hi) {
  if (lo === hi) { lo -= 1; hi += 1; }
  if (lo > 0 && lo < hi * 0.35) lo = 0;
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw);
  const d0 = Math.floor(lo / step) * step, d1 = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = d0; v <= d1 + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { d0, d1, ticks };
}

function convergenceChart(a) {
  const vals = [a.baseline, ...a.series.map((s) => s.value).filter((v) => v != null), ...(a.target != null ? [a.target] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const log10 = lo > 0 && hi / lo > 20;
  let d0, d1, ticks, f;
  if (log10) {
    f = Math.log10;
    d0 = Math.floor(Math.log10(lo)); d1 = Math.ceil(Math.log10(hi));
    ticks = [];
    for (let e = d0; e <= d1; e++) ticks.push(10 ** e);
  } else {
    f = (v) => v;
    ({ d0, d1, ticks } = niceLinear(lo, hi));
  }
  const sy = (v) => H - M.b - ((f(v) - d0) / (d1 - d0)) * (H - M.b - M.t);
  const yTicks = ticks.map((v) => ({ y: sy(v), label: num(v) }));
  const n = a.series.length + 1; // position 0 is the baseline
  const sx = xScale(n);
  const xTicks = [{ x: sx(0), label: '0' }, { x: sx(n - 1), label: String(n - 1) }];
  let s = axes(xTicks, yTicks, `attempt${log10 ? ' (log scale)' : ''}`, `metric (${a.direction} is better)`);
  const occupied = []; // boxes the annotations must not cover: markers, lines
  const box = (x0, y0, x1, y1) => occupied.push({ x0: Math.min(x0, x1) - 3, y0: Math.min(y0, y1) - 3, x1: Math.max(x0, x1) + 3, y1: Math.max(y0, y1) + 3 });
  if (a.target != null) {
    const ty = sy(a.target);
    s += `<line class="tgt" x1="${M.l}" y1="${ty.toFixed(1)}" x2="${W - M.r}" y2="${ty.toFixed(1)}"/>`;
    box(M.l, ty, W - M.r, ty);
  }
  // Best so far as a step line: flat until a kept win, then down (or up) to it.
  const bestPts = [{ x: sx(0), y: sy(a.baseline) }];
  a.series.forEach((p, i) => {
    const prev = i === 0 ? a.baseline : a.series[i - 1].best;
    bestPts.push({ x: sx(i + 1), y: sy(prev) }, { x: sx(i + 1), y: sy(p.best) });
  });
  for (let i = 1; i < bestPts.length; i++) box(bestPts[i - 1].x, bestPts[i - 1].y, bestPts[i].x, bestPts[i].y);
  s += `<polyline class="best line" points="${bestPts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}"/>`;
  s += marker.circle(sx(0), sy(a.baseline), 'base');
  box(sx(0) - 5, sy(a.baseline) - 5, sx(0) + 5, sy(a.baseline) + 5);
  a.series.forEach((p, i) => {
    const x = sx(i + 1);
    if (p.value == null) {
      s += `<text class="crash" x="${x.toFixed(1)}" y="${M.t + 10}" text-anchor="middle">${p.outcome === 'crash' ? '!' : '?'}</text>`;
      box(x - 4, M.t, x + 4, M.t + 12);
      return;
    }
    const y = sy(p.value);
    s += p.outcome === 'kept' ? marker.circle(x, y, 'kept') : marker.cross(x, y, 'rev');
    box(x - 5, y - 5, x + 5, y + 5);
  });
  // Annotations: the first candidate position that stays inside the plot and clear of the data.
  const note = (x, y, text) => {
    const w = text.length * 6.6, h = 13;
    const cands = [[10, -10], [10, 18], [-10 - w, -10], [-10 - w, 18], [10, -26], [-10 - w, -26], [10, 34], [-10 - w, 34]];
    const clear = ([dx, dy]) => {
      const b = { x0: x + dx, y0: y + dy - h + 2, x1: x + dx + w, y1: y + dy + 2 };
      if (b.x0 < M.l + 2 || b.x1 > W - M.r || b.y0 < M.t || b.y1 > H - M.b - 2) return false;
      return !occupied.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    };
    const [dx, dy] = cands.find(clear) ?? cands[0];
    occupied.push({ x0: x + dx, y0: y + dy - h + 2, x1: x + dx + w, y1: y + dy + 2 });
    const far = Math.abs(dy) > 20;
    const lx = dx > 0 ? x + dx - 2 : x + dx + w + 2;
    return (far ? `<line class="lead" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${(y + dy + (dy < 0 ? 2 : -h + 2)).toFixed(1)}"/>` : '')
      + `<text class="note" x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}">${esc(text)}</text>`;
  };
  s += note(sx(0), sy(a.baseline), `baseline ${num(a.baseline)}`);
  const bi = a.series.findIndex((p) => p.best === a.best);
  if (a.best !== a.baseline && bi >= 0) s += note(sx(bi + 1), sy(a.best), `best ${num(a.best)}`);
  const title = `Convergence over ${a.attempts} attempt(s): baseline ${num(a.baseline)}, best ${num(a.best)}`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${s}</svg>`;
}

const legend = (items) => `<ul class="legend">${items.map(([cls, label, sym]) => `<li class="${cls}"><span class="sym">${sym}</span>${esc(label)}</li>`).join('')}</ul>`;

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --bg: #ffffff; --fg: #1a1a1a; --muted: #5c5c5c; --grid: #e4e4e4; --axis: #8a8a8a; --card: #f7f7f7;
  --kept: #0072B2; --rev: #D55E00; --best: #009E73; --tgt: #E69F00; --bad: #b3261e; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #161616; --fg: #ececec; --muted: #a8a8a8; --grid: #2e2e2e; --axis: #7a7a7a; --card: #1f1f1f; --bad: #ff8a80; } }
:root[data-theme="dark"] { --bg: #161616; --fg: #ececec; --muted: #a8a8a8; --grid: #2e2e2e; --axis: #7a7a7a; --card: #1f1f1f; --bad: #ff8a80; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 980px; margin: 0 auto; }
h1 { font-size: 1.35rem; margin: 0 0 4px; } h2 { font-size: 1.02rem; margin: 0 0 2px; }
.sub, .meta { color: var(--muted); font-size: .88rem; margin: 0 0 12px; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 16px; }
.card { background: var(--card); border-radius: 10px; padding: 14px 14px 8px; min-width: 0; }
.card.bad { outline: 2px solid var(--bad); }
.flag { color: var(--bad); font-weight: 600; }
svg { width: 100%; height: auto; display: block; overflow: visible; }
svg .ax { stroke: var(--axis); stroke-width: 1; } svg .grid { stroke: var(--grid); stroke-width: 1; }
svg .tick, svg .lab, svg .note, svg .crash { fill: var(--muted); font-size: 11px; } svg .note { fill: var(--fg); font-size: 12px; }
svg .line { fill: none; stroke-width: 2; }
svg .w, svg .kept { fill: var(--kept); stroke: var(--kept); } svg .w.line { stroke: var(--kept); fill: none; }
svg .wo, svg .rev { fill: var(--rev); stroke: var(--rev); } svg .wo.line { stroke: var(--rev); fill: none; }
svg .x { fill: none; stroke-width: 2.2; } svg .open { fill: none; stroke-width: 2; } svg .faded { opacity: .35; }
svg .best.line { stroke: var(--best); } svg .base { fill: var(--fg); stroke: var(--fg); }
svg .lead { stroke: var(--muted); stroke-width: 1; }
svg .tgt { stroke: var(--tgt); stroke-width: 2; stroke-dasharray: 6 4; }
.legend { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 0; margin: 0 0 6px; font-size: .86rem; }
.legend .sym { margin-right: 6px; font-weight: 700; }
.legend .kept, .legend .w { color: var(--kept); } .legend .rev, .legend .wo { color: var(--rev); }
.legend .best { color: var(--best); } .legend .tgt { color: var(--tgt); } .legend .base, .legend .inc { color: var(--fg); }
table { border-collapse: collapse; font-size: .85rem; width: 100%; } th, td { text-align: left; padding: 3px 8px 3px 0; border-bottom: 1px solid var(--grid); vertical-align: top; }
.scroll { overflow-x: auto; }
</style>
</head>
<body><main>
${body}
</main></body>
</html>
`;
}

function behaveHtml(res, meta) {
  const flagged = (p) => res.regressions.some((r) => r.case === p.case && r.target === p.target);
  const cards = [...res.pairs.filter(flagged), ...res.pairs.filter((p) => !flagged(p))].map((p) => {
    const regs = res.regressions.filter((r) => r.case === p.case && r.target === p.target);
    const last = p.runs.at(-1);
    return `<section class="card${regs.length ? ' bad' : ''}"><h2>${esc(p.case)} / ${esc(p.target)}</h2>
<p class="meta">${p.runs.length} run(s), ${p.runs.filter((r) => r.complete).length} complete; ${shortTime(p.runs[0].time)} to ${shortTime(last.time)}. With score: ${esc(trendText(p.trend))}</p>
${regs.length ? `<p class="flag">${regs.map((r) => esc(`${r.what}: ${r.latest.toFixed(2)} vs best ${r.best.toFixed(2)} (spread ${r.spread.toFixed(2)})`)).join('<br>')}</p>` : ''}
${legend([['w', 'with', '●'], ['wo', 'without', '□'], ['inc', 'faded = incomplete run', '◌']])}
${behaveChart(p)}</section>`;
  }).join('\n');
  return page('Behave trends', `<h1>Behave trends</h1>
<p class="sub">${meta.runs} run(s) from ${esc(meta.dir)}. Scores recomputed from each session's grades; judge errors are undecided, never fails. ${res.regressions.length} regression(s).</p>
<div class="grid2">${cards}</div>`);
}

function attemptsHtml(a, file) {
  const items = [['kept', 'kept', '●'], ['rev', 'reverted', '×'], ['best', 'best so far', '—'], ['base', 'baseline', '●']];
  if (a.counts.crash) items.push(['base', 'crash (no number)', '!']);
  if (a.target != null) items.push(['tgt', `target ${num(a.target)}`, '- -']);
  const rows = a.series.map((s) => `<tr><td>${esc(s.attempt)}</td><td>${esc(s.outcome)}</td><td>${s.value == null ? '-' : esc(num(s.value))}</td><td>${esc(num(s.best))}</td></tr>`).join('');
  return page('Optimize convergence', `<h1>Optimize convergence</h1>
<p class="sub">${esc(basename(file))}: ${a.attempts} attempt(s), kept ${a.counts.kept}, reverted ${a.counts.reverted}, crash ${a.counts.crash}. Baseline ${esc(num(a.baseline))}, best ${esc(num(a.best))} (${a.improvement.factor.toFixed(2)}x). ${a.plateaus.length ? `Plateau(s): ${a.plateaus.map((p) => `#${esc(p.from)} to #${esc(p.to)}`).join(', ')}.` : 'No plateau.'}${a.keptWorse.length ? ' <span class="flag">A kept attempt was not better than its before.</span>' : ''}</p>
<section class="card">${legend(items)}${convergenceChart(a)}<p class="meta">${esc(a.direction)} is better.</p></section>
<section class="card scroll" style="margin-top:16px"><table><thead><tr><th>#</th><th>outcome</th><th>after</th><th>best so far</th></tr></thead><tbody>${rows}</tbody></table></section>`);
}

// ---------- modes ----------

function runBehave(dir, html) {
  const { runs, skipped } = loadRuns(dir);
  const commits = skillCommits(ROOT);
  const res = analyzeBehave(runs, commits);
  const meta = { dir, runs: runs.length, skipped, git: !!commits };
  reportBehave(res, meta);
  if (html) { writeFileSync(html, behaveHtml(res, meta)); log(`html: ${html}`); }
  return {
    code: res.regressions.length ? 1 : 0,
    out: { ok: !res.regressions.length, mode: 'behave', dir, runs: runs.length, skipped, git: !!commits, regressions: res.regressions, pairs: res.pairs.map((p) => ({ case: p.case, target: p.target, trend: p.trend, graders: p.graders, runs: p.runs.map(({ time, ...r }) => r) })) },
  };
}

function runAttempts(file, opts, html) {
  if (!existsSync(file)) throw new CannotRun(`no attempt log at ${file}`);
  const a = analyzeAttempts(readFileSync(file, 'utf8'), opts);
  reportAttempts(a, file);
  if (html) { writeFileSync(html, attemptsHtml(a, file)); log(`html: ${html}`); }
  return { code: a.keptWorse.length ? 1 : 0, out: { ok: !a.keptWorse.length, mode: 'attempts', file, ...a } };
}

// ---------- selftest ----------

function writeRun(dir, stamp, sessions) {
  const d = join(dir, `behave-${stamp}`);
  mkdirSync(d, { recursive: true });
  const rows = sessions.map((s, i) => ({
    case: s.case, target: s.target ?? 't', arm: s.arm ?? 'with', run: i + 1, warnings: [], invalid: s.invalid, seconds: 1,
    grades: Object.entries(s.grades ?? {}).map(([id, status]) => ({ id, arm: 'both', status, why: status })),
  }));
  writeFileSync(join(d, 'results.json'), JSON.stringify({ stamp, summary: [], rows }));
}
const stampAt = (i) => `2026-01-0${i + 1}T00-00-00-000Z`;
const grades = (passes, of) => Object.fromEntries(Array.from({ length: of }, (_, i) => [`g${i}`, i < passes ? 'pass' : 'fail']));

function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'trends-selftest-'));
  const checks = [];
  const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); log(`  ${ok ? 'caught' : 'MISSED'}  ${name}${detail ? `  (${detail})` : ''}`); };
  const self = fileURLToPath(import.meta.url);
  const spawn = (args) => spawnSync(process.execPath, [self, ...args], { encoding: 'utf8' });
  try {
    log('trends selftest:');
    // 1. A real regression, beside a noisy series and a short one that must not be flagged.
    const reg = join(tmp, 'regression');
    [4, 3, 4, 1].forEach((p, i) => writeRun(reg, stampAt(i), [
      { case: 'drops', grades: grades(p, 4) },
      { case: 'noisy', grades: grades([4, 3, 4, 3][i], 4) },
      ...(i < 2 ? [{ case: 'short', grades: grades([4, 1][i], 4) }] : []),
    ]));
    const r1 = analyzeBehave(loadRuns(reg).runs, null);
    const find = (c) => r1.pairs.find((p) => p.case === c);
    check('a with-score drop beyond the spread is flagged', find('drops').trend.status === 'regression', `1.00, 0.75, 1.00 then 0.25: ${find('drops').trend.status}`);
    check('a drop within the spread is not flagged', find('noisy').trend.status === 'ok', `1.00, 0.75, 1.00 then 0.75: ${find('noisy').trend.status}`);
    check('two runs give "too few runs", not a verdict', find('short').trend.status === 'too few runs', find('short').trend.status);
    check('a grader pass-rate drop is flagged', r1.regressions.some((r) => r.case === 'drops' && r.what.startsWith('grader ')));
    const s1 = spawn(['--results', reg]);
    check('a regression exits 1', s1.status === 1, `exit ${s1.status}`);

    // 2. A judge error in the latest run is undecided, not a fail: no regression, rate from decided grades only.
    const je = join(tmp, 'judge-error');
    for (let i = 0; i < 4; i++) {
      writeRun(je, stampAt(i), [0, 1, 2].map((k) => ({ case: 'judged', grades: { a: i === 3 && k === 0 ? 'error' : 'pass', b: 'pass' } })));
    }
    const r2 = analyzeBehave(loadRuns(je).runs, null);
    const last = r2.pairs[0].runs.at(-1);
    check('a judge error is not counted as a fail', last.graders.a.with.failed === 0 && last.graders.a.with.errors === 1 && decidedRate(last.graders.a.with) === 1 && last.with === 1, `grader a: ${cell(last.graders.a.with)}, with ${last.with}`);
    check('a judge error raises no regression', r2.regressions.length === 0, `${r2.regressions.length} regression(s)`);
    const s2 = spawn(['--results', je]);
    check('a run with only a judge error exits 0', s2.status === 0, `exit ${s2.status}`);

    // 3. Attempt logs: a plateau, no plateau, a kept loss.
    const plateauLog = `| # | Idea | Before (ms) | After (ms) | Outcome |\n|---|---|---|---|---|\n| 0 | baseline | 1,000 | – | baseline |\n| 1 | map lookup | 1000 | 400 | kept |\n| 2 | batch | 400 | 420 | reverted: flat |\n| 3 | cache | 400 | – | crash |\n| 4 | lazy | 400 | 410 | reverted |\n| 5 | stream | 400 | 300 | kept |\n`;
    const a3 = analyzeAttempts(plateauLog);
    check('a plateau of 3 attempts with no win is found', a3.plateaus.length === 1 && a3.plateaus[0].length === 3 && a3.plateaus[0].from === '2', JSON.stringify(a3.plateaus));
    check('keep rate, baseline and best are read', a3.counts.kept === 2 && a3.baseline === 1000 && a3.best === 300 && a3.biggestWin?.attempt === '1', `kept ${a3.counts.kept}, ${a3.baseline} -> ${a3.best}`);
    const noPlateau = analyzeAttempts(`| # | Idea | Before | After | Outcome |\n|---|---|---|---|---|\n| 1 | a | 10 | 8 | kept |\n| 2 | b | 8 | 9 | reverted |\n| 3 | c | 8 | 7 | kept |\n| 4 | d | 7 | 7 | reverted |\n| 5 | e | 7 | 6 | kept |\n`);
    check('alternating wins are not a plateau', noPlateau.plateaus.length === 0, JSON.stringify(noPlateau.plateaus));
    const lossFile = join(tmp, 'loss.md');
    writeFileSync(lossFile, `| # | Idea | Before | After | Outcome |\n|---|---|---|---|---|\n| 1 | a | 10 | 8 | kept |\n| 2 | b | 8 | 9 | kept |\n`);
    const s3 = spawn(['--attempts', lossFile, '--direction', 'lower']);
    check('a kept attempt that got worse exits 1', s3.status === 1, `exit ${s3.status}`);
    const badCols = join(tmp, 'cols.md');
    writeFileSync(badCols, '| # | Idea | Result |\n|---|---|---|\n| 1 | a | 3 |\n');
    const s4 = spawn(['--attempts', badCols]);
    check('an attempt log missing columns exits 2', s4.status === 2, `exit ${s4.status}`);

    // 4. Nothing to inspect is "couldn't run", never a clean pass.
    const empty = join(tmp, 'empty');
    mkdirSync(empty);
    const s5 = spawn(['--results', empty]);
    check('an empty results folder exits 2', s5.status === 2, `exit ${s5.status}`);

    // 5. The HTML is self-contained.
    const html = join(tmp, 'out.html');
    spawn(['--attempts', lossFile, '--html', html, '--target', '7']);
    const h = existsSync(html) ? readFileSync(html, 'utf8') : '';
    check('the HTML page is self-contained', h.includes('<svg') && h.includes('prefers-color-scheme') && !/<script|<link|@import|url\(/i.test(h) && !/https?:\/\/(?!www\.w3\.org)/.test(h), h ? `${h.length} bytes` : 'not written');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const missed = checks.filter((c) => !c.ok);
  log(missed.length ? `selftest: ${missed.length} of ${checks.length} planted faults MISSED` : `selftest: all ${checks.length} planted faults caught`);
  return { code: missed.length ? 1 : 0, out: { ok: !missed.length, mode: 'selftest', checks } };
}

// ---------- main ----------

try {
  const o = parseArgs(process.argv.slice(2));
  const html = o.html ? resolve(o.html) : null;
  const r = o.selftest
    ? selftest()
    : o.attempts
      ? runAttempts(resolve(o.attempts), { direction: o.direction, target: o.target }, html)
      : runBehave(resolve(o.results ?? join(HERE, 'results')), html);
  finish(r.out, r.code);
} catch (e) {
  // Anything unexpected is also "couldn't run" (2), never mistaken for a flagged regression (1).
  log(`trends: couldn't run: ${e instanceof CannotRun ? e.message : e.stack}`);
  finish({ ok: false, error: e.message }, 2);
}
