#!/usr/bin/env node
// Read-only worktree prune audit (idea from poteto-mode's worktree-audit.sh, cursor/plugins, MIT).
// Classifies every git worktree except the main one into a bucket and never deletes anything:
// removing a worktree stays a step a person takes.
//
//   hold-wip       tracked changes not committed
//   hold-open-pr   its branch has an open PR
//   recent         something happened in it in the last RECENT_DAYS days (a file edit, or a Claude Code
//                  session whose working directory was the worktree)
//   safe           merged into the base branch, or its PR is merged or closed, and nothing above applies
//   review         none of the above: unmerged work with no PR
//
// Usage: node worktree-audit.mjs [repo-path] [--base <branch>] [--no-fetch] [--recent-days N]
//        node worktree-audit.mjs --selftest
// Exit: 0 audited (JSON array on stdout, table on stderr), 2 couldn't run (not a repo, git missing).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const DAY = 86_400_000;
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'bin', 'obj', 'target', 'dist']);

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function worktrees(repo) {
  const r = git(repo, 'worktree', 'list', '--porcelain');
  if (!r.ok) throw new Error(`git worktree list failed: ${r.err}`);
  const list = [];
  for (const block of r.out.split(/\n\n+/)) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    if (!path) continue;
    list.push({ path: resolve(path), branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null, detached: /^detached$/m.test(block) });
  }
  return list;
}

// Newest mtime and total size of the worktree's files, skipping dependency and build folders.
function scan(dir, now, budget = { files: 50_000 }) {
  let newest = 0;
  let bytes = 0;
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (budget.files-- <= 0) return;
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue; }
      try {
        const s = statSync(p);
        bytes += s.size;
        if (s.mtimeMs <= now && s.mtimeMs > newest) newest = s.mtimeMs;
      } catch { /* vanished mid-scan */ }
    }
  };
  walk(dir);
  return { newest, bytes, truncated: budget.files <= 0 };
}

// Claude Code keeps a session's transcript under ~/.claude/projects/<path with every non-alphanumeric
// character replaced by "-">; a folder for this worktree means an agent session ran with it as cwd.
function lastSession(path) {
  const dir = join(homedir(), '.claude', 'projects', path.replace(/[^A-Za-z0-9]/g, '-'));
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const f of readdirSync(dir)) {
    try { newest = Math.max(newest, statSync(join(dir, f)).mtimeMs); } catch { /* skip */ }
  }
  return newest;
}

function prsByBranch(repo) {
  const r = spawnSync('gh', ['pr', 'list', '--author', '@me', '--state', 'all', '--limit', '1000', '--json', 'number,state,headRefName'], { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const map = new Map();
  try { for (const p of JSON.parse(r.stdout)) if (!map.has(p.headRefName)) map.set(p.headRefName, p); } catch { return null; }
  return map;
}

const human = (b) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(1)}G` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)}M` : `${Math.ceil(b / 1024)}K`);

export function bucketFor({ wip, prState, recent, merged }) {
  if (wip) return 'hold-wip';
  if (prState === 'OPEN') return 'hold-open-pr';
  if (recent) return 'recent';
  if (merged || prState === 'MERGED' || prState === 'CLOSED') return 'safe';
  return 'review';
}

export function audit(repo, { base, fetch = true, recentDays = 4, prs, now = Date.now() } = {}) {
  const top = git(repo, 'rev-parse', '--show-toplevel');
  if (!top.ok) throw new Error(`not a git repository: ${repo}`);
  const list = worktrees(top.out);
  const main = list[0]?.path;
  const baseName = base ?? (git(top.out, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD').out.replace(/^origin\//, '') || 'main');
  const hasRemote = git(top.out, 'remote').out.split('\n').includes('origin');
  if (fetch && hasRemote && !git(top.out, 'fetch', 'origin', baseName, '--quiet').ok) process.stderr.write(`warn: could not fetch origin/${baseName}; the merged column may be stale\n`);
  const baseRef = hasRemote && git(top.out, 'rev-parse', '--verify', '--quiet', `origin/${baseName}`).ok ? `origin/${baseName}` : baseName;
  const prMap = prs === undefined ? prsByBranch(top.out) : prs;
  const rows = [];
  for (const wt of list.slice(1)) {
    if (!existsSync(wt.path)) { rows.push({ path: wt.path, branch: wt.branch, bucket: 'review', note: 'missing on disk (git worktree prune clears it)' }); continue; }
    const head = git(wt.path, 'rev-parse', 'HEAD').out;
    const headTime = Number(git(wt.path, 'log', '-1', '--format=%ct').out) * 1000 || 0;
    const merged = git(top.out, 'merge-base', '--is-ancestor', head, baseRef).ok;
    const status = git(wt.path, 'status', '--porcelain').out.split('\n').filter(Boolean);
    const tracked = status.filter((l) => !l.startsWith('??')).length;
    const untracked = status.length - tracked;
    let remote = 'detached';
    if (wt.branch) {
      const up = git(wt.path, 'rev-parse', '--verify', '--quiet', `origin/${wt.branch}`);
      remote = !up.ok ? 'no-remote' : up.out === head ? 'pushed' : `ahead ${git(wt.path, 'rev-list', '--count', `origin/${wt.branch}..HEAD`).out}`;
    }
    const pr = wt.branch && prMap ? prMap.get(wt.branch) : undefined;
    const files = scan(wt.path, now);
    const activity = Math.max(files.newest, lastSession(wt.path), headTime);
    const recent = activity > 0 && now - activity <= recentDays * DAY;
    rows.push({
      path: wt.path,
      branch: wt.branch,
      size: human(files.bytes) + (files.truncated ? '+' : ''),
      ageDays: headTime ? Math.floor((now - headTime) / DAY) : null,
      lastActivityDays: activity ? Math.floor((now - activity) / DAY) : null,
      merged,
      dirty: tracked ? `wip:${tracked}` : untracked ? `scratch:${untracked}` : 'clean',
      remote,
      pr: pr ? `#${pr.number}/${pr.state}` : prMap ? '-' : 'unknown (gh unavailable)',
      bucket: bucketFor({ wip: tracked > 0, prState: pr?.state, recent, merged }),
      bytes: files.bytes,
    });
  }
  rows.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));
  return { main, base: baseRef, rows };
}

function selftest() {
  const root = mkdtempSync(join(tmpdir(), 'wt-audit-'));
  const problems = [];
  try {
    const repo = join(root, 'repo');
    const run = (cwd, ...a) => { const r = git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a); if (!r.ok) throw new Error(`git ${a.join(' ')}: ${r.err}`); return r.out; };
    spawnSync('git', ['init', '-q', '-b', 'main', repo]);
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    run(repo, 'add', '-A'); run(repo, 'commit', '-qm', 'base');
    const add = (name) => { run(repo, 'worktree', 'add', '-q', '-b', name, join(root, name)); return join(root, name); };
    const merged = add('merged');
    const wip = add('wip'); writeFileSync(join(wip, 'a.txt'), 'changed\n');
    const unmerged = add('unmerged'); writeFileSync(join(unmerged, 'b.txt'), 'b\n'); run(unmerged, 'add', '-A'); run(unmerged, 'commit', '-qm', 'work');
    const openPr = add('open-pr'); writeFileSync(join(openPr, 'c.txt'), 'c\n'); run(openPr, 'add', '-A'); run(openPr, 'commit', '-qm', 'pr');
    const prs = new Map([['open-pr', { number: 7, state: 'OPEN', headRefName: 'open-pr' }]]);
    const later = Date.now() + 30 * DAY; // everything is 30 days old from this vantage point
    const want = { merged: 'safe', wip: 'hold-wip', unmerged: 'review', 'open-pr': 'hold-open-pr' };
    const got = Object.fromEntries(audit(repo, { fetch: false, prs, now: later }).rows.map((r) => [r.branch, r.bucket]));
    for (const [b, bucket] of Object.entries(want)) if (got[b] !== bucket) problems.push(`${b}: bucket ${got[b]}, want ${bucket}`);
    const fresh = Object.fromEntries(audit(repo, { fetch: false, prs, now: Date.now() }).rows.map((r) => [r.branch, r.bucket]));
    if (fresh.unmerged !== 'recent') problems.push(`unmerged edited just now: bucket ${fresh.unmerged}, want recent`);
    if (fresh.wip !== 'hold-wip') problems.push('uncommitted work must hold even when recent');
    let threw = false;
    try { audit(join(root, 'not-a-repo-' + Date.now())); } catch { threw = true; }
    if (!threw) problems.push('a path outside any repository must fail, not audit nothing');
  } catch (e) {
    problems.push(`selftest could not run: ${e.message}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  process.stderr.write(`worktree-audit --selftest: 4 buckets + recency + non-repo, ${problems.length} problem(s)\n${problems.map((p) => `  ${p}\n`).join('')}`);
  process.stdout.write(JSON.stringify({ status: problems.length ? 'failures' : 'ok', problems }) + '\n');
  process.exit(problems.length ? 1 : 0);
}

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
if (args.includes('--selftest')) selftest();
const repoArg = args.find((a, i) => !a.startsWith('--') && !['--base', '--recent-days'].includes(args[i - 1])) ?? process.cwd();
try {
  const { main, base, rows } = audit(resolve(repoArg), { base: opt('--base'), fetch: !args.includes('--no-fetch'), recentDays: Number(opt('--recent-days') ?? 4) });
  const cols = ['size', 'ageDays', 'lastActivityDays', 'merged', 'dirty', 'remote', 'pr', 'bucket', 'path'];
  process.stderr.write(`main: ${main}\nbase: ${base}\n${cols.join('\t')}\n${rows.map((r) => cols.map((c) => r[c] ?? '-').join('\t')).join('\n')}\n${rows.length ? '' : '(no worktrees besides the main one)\n'}Nothing was deleted. Remove a worktree with \`git worktree remove <path>\` (never --force on hold-wip).\n`);
  process.stdout.write(JSON.stringify(rows.map(({ bytes, ...r }) => r)) + '\n');
} catch (e) {
  process.stderr.write(`worktree-audit: ${e.message}\n`);
  process.stdout.write(JSON.stringify({ status: 'error', error: e.message }) + '\n');
  process.exit(2);
}
