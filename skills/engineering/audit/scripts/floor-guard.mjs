#!/usr/bin/env node
// floor-guard.mjs: diff-scoped check for moves that lower the quality bar.
// Adapted from addyosmani/agent-skills (constraint-driven-development/references/floor-guard.md), MIT;
// the curated-file shrink check from open-gsd/gsd-core, MIT.
//
// Usage: node floor-guard.mjs [--base <ref>]
//   Default base: origin/main, then main, then master.
// Exit codes: 0 clean, 1 at least one violation, 2 could not run (never read 2 as clean).
// stdout: one JSON object {status, base, findings[]}; stderr: human-readable report.
// Secrets are reported by rule and location only, never by value.
// Paths listed in .constraintsignore (one glob per line, # for comments) are exempt.
// Code-pattern rules distinguish documentation/records and proven JS data contexts.
// Secrets always use raw added text; preservation and constraint checks stay separate.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { policyLines } from './policy-lines.mjs';

const report = (status, extra = {}) => {
  process.stdout.write(JSON.stringify({ status, ...extra }) + '\n');
};

const git = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

// --selftest: prove the guard still catches what it claims to. Builds a throwaway repo with a clean base and a
// branch planting one violation per rule, runs this script on it, and checks every rule fires; then checks a
// clean branch passes and a non-repo fails to run.
if (process.argv.includes('--selftest')) {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const self = fileURLToPath(import.meta.url);
  const repo = mkdtempSync(join(tmpdir(), 'floor-guard-selftest-'));
  const g = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...a], { cwd: repo, stdio: 'ignore' });
  const put = (f, s) => writeFileSync(join(repo, f), s);
  const run = (cwd) => {
    try { return { code: 0, out: execFileSync(process.execPath, [self, '--base', 'main'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }; }
    catch (e) { return { code: e.status, out: e.stdout ?? '' }; }
  };
  const problems = [];
  try {
    g('init', '-q', '-b', 'main');
    put('app.test.js', "test('adds', () => { expect(add(1, 2)).toBe(3); });\n");
    put('gone.test.js', "test('x', () => { expect(1).toBe(1); });\n");
    put('CONSTRAINTS.md', '# Constraints\n\n## Floor\n\n- No new suppressions\n- No stubs\n\n| Dimension | Rule |\n|---|---|\n| Coverage | 80 |\n| p95 latency | ≤ 300 ms |\n| Bundle size | at most 200 KB |\n| Retries | 3 per job, max 5 |\n| Rank-1 rate | ≥ 85% |\n');
    put('CONTEXT.md', Array.from({ length: 12 }, (_, i) => `- term ${i}`).join('\n') + '\n');
    mkdirSync(join(repo, 'docs/capabilities'), { recursive: true });
    const capability = Array.from({ length: 12 }, (_, i) => `- verified capability ${i}`).join('\n') + '\n';
    put('docs/capabilities/auth.md', capability);
    put('docs/capabilities/retired.md', capability);
    g('add', '-A');
    g('commit', '-qm', 'base');
    g('checkout', '-qb', 'clean');
    put('ok.js', 'export const ok = 1;\n');
    // Stricter thresholds must stay quiet: a lower maximum, a higher minimum.
    put('CONSTRAINTS.md', '# Constraints\n\n## Floor\n\n- No new suppressions\n- No stubs\n\n| Dimension | Rule |\n|---|---|\n| Coverage | 80 |\n| p95 latency | ≤ 250 ms |\n| Bundle size | at most 150 KB |\n| Retries | 3 per job, max 5 |\n| Rank-1 rate | ≥ 90% |\n');
    // Look-alikes of the Rust suppressions below that must stay quiet.
    put('ok.sh', 'git add -A\ngrep -A 3 needle file.txt\nls -Al\ncargo clippy --all-targets -- -D warnings\necho "see RUSTSEC-2023-0071"\n');
    // An empty [bans] skip, [bans] deny entries shaped like skip entries, and a skip key outside [bans].
    put('deny.toml', '[advisories]\n# RUSTSEC-2023-0071 was fixed in 0.9.2; keep this list empty\nyanked = "deny"\n\n[licenses]\nallow = ["MIT", "Apache-2.0"]\n\n[bans]\nskip = []\ndeny = [\n    { crate = "openssl", reason = "use rustls" },\n    "native-tls",\n]\n\n[sources]\nskip = ["not-a-bans-entry"]\n');
    put('Cargo.toml', '[workspace.lints.clippy]\nall = "deny"\n\n[lints]\nworkspace = true\n');
    put('ok.rs', '#[must_use]\n#[derive(Debug)]\npub fn allow(x: u8) -> u8 { x }\n');
    const lf = String.fromCharCode(10);
    put('notes.md', 'Find `TODO.md`; never add `@ts-ignore` or `test.skip()` to get green.' + lf);
    put('previous.log', '{"findings":[{"text":"TODO.md and test.skip()"}]}' + lf);
    put('fallback.mjs', ['const label = `${value / divisor}`;', '// extra.skip(ctx, m) filters text.'].join(lf) + lf);
    put('data.mjs', [
      '// extra.skip(ctx, m) filters text, not tests.',
      'const pattern = /^bans.skip(?:-tree)?$/;',
      'const forbidden = new RegExp(["@ts-ignore", "TODO"].join("|"));',
      'const matcher = new RegExp("TODO");',
    ].join(lf) + lf);
    g('add', '-A');
    g('commit', '-qm', 'clean');
    copyFileSync(self, join(repo, 'copied-guard.mjs'));
    const c = run(repo);
    if (c.code !== 0) {
      const hits = (JSON.parse(c.out.trim() || '{}').findings ?? []).map((x) => `${x.file}:${x.line} ${x.text}`);
      problems.push(`a clean branch was not reported clean${hits.length ? ': ' + hits.join('; ') : ''}`);
    }
    g('checkout', '-q', 'main');
    g('checkout', '-qb', 'dirty');
    put('bad.js', '// @ts-ignore\nconst k = "AKIA' + 'ABCDEFGHIJKLMNOP";\nfunction f() { throw new Error("not implemented"); }\n');
    put('app.test.js', "test.skip('adds', () => {});\n");
    rmSync(join(repo, 'gone.test.js'));
    put('CONSTRAINTS.md', '# Constraints\n\n## Floor\n\n- No new suppressions\n\n| Dimension | Rule |\n|---|---|\n| Coverage | 60 |\n| p95 latency | ≤ 500 ms |\n| Bundle size | at most 200 KB |\n| Retries | max 5 |\n| Rank-1 rate | ≥ 85% |\n');
    put('CONTEXT.md', '- term 0\n');
    put('docs/capabilities/auth.md', '- verified capability 0\n');
    rmSync(join(repo, 'docs/capabilities/retired.md'));
    // Rust suppressions, one per line: outer and inner allow and expect, an "allow" level in [lints], an -A flag, a
    // new --force-warn ratchet entry, cfg_attr and --cap-lints forms, RUSTSEC advisory ignores (cargo-deny and
    // cargo-audit files, the --ignore flag, the audit-check action input), and cargo-deny [bans] skip and skip-tree
    // entries (multi-line and inline arrays, and the dotted top-level key).
    const rust = {
      'lib.rs': ['#![allow(dead_code)]', '#[expect(clippy::needless_return)]', '#![expect(unused)]', '#[cfg_attr(test, allow(unused_variables))]', '#[allow(clippy::too_many_arguments)]'],
      'Cargo.toml': ['[workspace.lints.clippy]', 'pedantic = { level = "allow", priority = -1 }', "needless_return = 'allow'"],
      '.cargo/config.toml': ['[alias]', 'lint = ["clippy", "--", "-D", "warnings",', '  "--force-warn", "clippy::needless_return",', '  "-A", "dead_code",', ']'],
      'ci.yml': ['env:', '  RUSTFLAGS: "-Awarnings"', 'run: cargo clippy -- --allow=clippy::pedantic', 'run: cargo build --config build.rustflags=["--cap-lints", "warn"]', 'run: cargo audit --ignore RUSTSEC-2021-0145', '    ignore: RUSTSEC-2020-0071'],
      'deny.toml': ['bans.skip-tree = ["ring@0.16"]', '', '[advisories]', 'ignore = [', '    "RUSTSEC-2023-0071",', '    { id = "RUSTSEC-2024-0001", reason = "no fix upstream" },', ']', '', '[bans]', 'multiple-versions = "deny"', 'deny = [', '    { crate = "openssl", reason = "use rustls" },', ']', 'skip = [', '    { crate = "windows-sys@0.48", reason = "two versions [for now]" }, # until ] the bump', '    "bitflags@1.3",', ']', 'skip-tree = [{ crate = "tokio@0.2", depth = 1 }]'],
      '.cargo/audit.toml': ['[advisories]', 'ignore = ["RUSTSEC-2020-0036"]'],
    };
    const expectFlagged = { 'lib.rs': [1, 2, 3, 4, 5], 'Cargo.toml': [2, 3], '.cargo/config.toml': [3, 4], 'ci.yml': [2, 3, 4, 5, 6], 'deny.toml': [1, 5, 6, 15, 16, 18], '.cargo/audit.toml': [2] };
    mkdirSync(join(repo, '.cargo'));
    for (const [f, lines] of Object.entries(rust)) put(f, lines.join('\n') + '\n');
    g('add', '-A');
    g('commit', '-qm', 'dirty');
    // Keep this file untracked: the guard must still check effective new code.
    put('untracked.mjs', [
      '// @ts-ignore',
      '// TODO implement the missing branch',
      'try { operation(); } catch {}',
      'throw new Error("not implemented");',
      'test.skip("real disabled test", () => {});',
      'evaluate(`try { operation(); } catch {}`);',
      'eval("try { operation(); } catch {}");',
      'execFileSync("cargo", ["clippy", "--force-warn", "clippy::needless_return"]);',
      'const options = { env: { RUSTFLAGS: "-Awarnings" } };',
      'const code = "try { operation(); } catch {}"; eval(code);',
      'import { execSync as execute } from "node:child_process"; execute("cargo clippy -- -Awarnings");',
      'process.env.RUSTFLAGS = "-Awarnings";',
      "const message = `don't`; try { operation(); } catch {} test.skip('disabled', () => {});",
      'const n = {} / 2; try { operation(); } catch {} // explanation',
      'eval /* execute */ ("try { operation(); } catch {}");',
      'throw new Error(/* reason */ "not implemented");',
      'const argument = "--force-warn clippy::needless_return";',
      "RegExp((() => { const code = 'try { operation(); } catch {}'; eval(code); return 'x'; })());",
      'if (ready) {} /[//]/.test(value); test.skip("disabled", () => {});',

    ].join(lf) + lf);
    put('secret.md', 'ghp_' + 'A'.repeat(36) + lf);
    put('secret.log', '-----BEGIN ' + 'PRIVATE KEY-----' + lf);
    const r = run(repo);
    const found = JSON.parse(r.out.trim() || '{}').findings ?? [];
    const rules = new Set(found.map((x) => x.rule));
    for (const [line, rule] of [[1, 'silenced-checker'], [2, 'unfinished-work'], [3, 'unfinished-work'],
      [4, 'unfinished-work'], [5, 'test-made-easier'], [6, 'unfinished-work'], [7, 'unfinished-work'],
      [8, 'silenced-checker'], [9, 'silenced-checker'], [10, 'unfinished-work'],
      [11, 'silenced-checker'], [12, 'silenced-checker'], [13, 'unfinished-work'], [13, 'test-made-easier'],
      [14, 'unfinished-work'], [15, 'unfinished-work'], [16, 'unfinished-work'], [17, 'silenced-checker'], [18, 'unfinished-work'], [19, 'test-made-easier']]) {
      if (!found.some((x) => x.file === 'untracked.mjs' && x.line === line && x.rule === rule)) {
        problems.push(`missed effective untracked code: ${line} ${rule}`);
      }
    }
    for (const file of ['secret.md', 'secret.log']) {
      const secret = found.find((x) => x.file === file && x.rule === 'secret-in-diff');
      if (!secret || secret.text !== '[redacted]') problems.push(`secret scan or redaction lost for ${file}`);
    }
    for (const file of ['docs/capabilities/auth.md', 'docs/capabilities/retired.md']) {
      if (!found.some((x) => x.rule === 'curated-file-shrunk' && x.file === file)) problems.push(`missed capability preservation: ${file}`);
    }
    if (r.code !== 1) problems.push(`violations exit ${r.code}, expected 1`);
    for (const rule of ['silenced-checker', 'secret-in-diff', 'unfinished-work', 'test-made-easier', 'assertion-removed', 'test-file-deleted', 'threshold-lowered', 'threshold-removed', 'floor-rule-removed', 'curated-file-shrunk']) {
      if (!rules.has(rule)) problems.push(`missed: ${rule}`);
    }
    for (const [f, want] of Object.entries(expectFlagged)) {
      const got = new Set(found.filter((x) => x.rule === 'silenced-checker' && x.file === f).map((x) => x.line));
      for (const n of want) if (!got.has(n)) problems.push(`missed Rust suppression: ${f}:${n} ${rust[f][n - 1].trim()}`);
      for (const n of got) if (!want.includes(n)) problems.push(`false positive: ${f}:${n} ${rust[f][n - 1].trim()}`);
    }
    const thr = found.filter((x) => x.rule === 'threshold-lowered' || x.rule === 'threshold-removed').map((x) => x.text);
    for (const [row, rule] of [['Coverage', 'threshold-lowered'], ['p95 latency', 'threshold-lowered'], ['Retries', 'threshold-removed']]) {
      if (!found.some((x) => x.rule === rule && x.text.includes(row))) problems.push(`missed ${rule} on the ${row} row`);
    }
    for (const row of ['Bundle size', 'Rank-1 rate']) if (thr.some((t) => t.includes(row))) problems.push(`false positive: unchanged ${row} row flagged`);
    if (run(tmpdir()).code !== 2) problems.push('outside a git repo it did not fail to run (exit 2)');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`floor-guard --selftest: ${problems.length} problem(s)`);
  process.stdout.write(JSON.stringify({ status: problems.length ? 'broken' : 'ok', problems }) + '\n');
  process.exit(problems.length ? 1 : 0);
}

if (git(['rev-parse', '--is-inside-work-tree'])?.trim() !== 'true') {
  console.error('floor-guard: not inside a git work tree');
  report('error', { reason: 'not a git work tree' });
  process.exit(2);
}

const argBase = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : null;
})();
const candidates = argBase ? [argBase] : ['origin/main', 'main', 'master'];
let base = null;
let mergeBase = null;
for (const c of candidates) {
  const mb = git(['merge-base', c, 'HEAD'])?.trim();
  if (mb) { base = c; mergeBase = mb; break; }
}
if (!mergeBase) {
  console.error(`floor-guard: no merge base against ${candidates.join(' / ')}`);
  report('error', { reason: 'no merge base', tried: candidates });
  process.exit(2);
}

// Ignore globs.
const ignoreGlobs = existsSync('.constraintsignore')
  ? readFileSync('.constraintsignore', 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : [];
const globToRegex = (g) =>
  new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*') + '$');
const ignoreRes = ignoreGlobs.map(globToRegex);
const ignored = (file) => ignoreRes.some((re) => re.test(file));

// Collect added and removed lines: tracked changes since the merge base, plus untracked files.
const added = [];
const removed = [];
const diff = git(['diff', '--unified=0', '--no-color', '--no-ext-diff', mergeBase, '--']) ?? '';
let file = '';
let newLine = 0;
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : ''; continue; }
  if (line.startsWith('--- ')) {
    if (line === '--- /dev/null') continue;
    if (!file) file = line.startsWith('--- a/') ? line.slice(6) : file;
    continue;
  }
  const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunk) { newLine = Number(hunk[1]); continue; }
  if (line.startsWith('+')) { added.push({ file, line: newLine, text: line.slice(1) }); newLine++; }
  else if (line.startsWith('-')) removed.push({ file, text: line.slice(1) });
}
for (const f of (git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n').filter(Boolean)) {
  let content;
  try { content = readFileSync(f, 'utf8'); } catch { continue; }
  if (content.includes('\u0000')) continue; // binary
  content.split(/\r?\n/).forEach((text, i) => added.push({ file: f, line: i + 1, text }));
}

const findings = [];
const flag = (rule, f, line, text, redact = false) => {
  if (ignored(f)) return;
  findings.push({ rule, file: f, line, text: redact ? '[redacted]' : text.trim().slice(0, 120) });
};

// Patterns. Extend per stack; the plumbing and exit codes stay the same.
// A Rust lint name: a known one-word lint or group, a snake_case lint, or a tool-prefixed one. Requiring this shape
// after -A keeps `git add -A`, `grep -A 3` and `ls -Al` quiet.
const RUST_LINT = '(?:warnings|unused|deprecated|[a-z][a-z0-9]*(?:_[a-z0-9]+)+|(?:clippy|rustdoc|rustc)::[a-z0-9_]+)(?![\\w:./-])';
const SUPPRESSIONS = new RegExp([
  '@ts-ignore', '@ts-nocheck', '@ts-expect-error', 'eslint-disable', 'biome-ignore', 'istanbul ignore', 'c8 ignore',
  '# *noqa', '# *type: *ignore', '# *pragma: *no cover', 'nosemgrep', 'gitleaks:allow', 'Stryker disable',
  '#pragma warning disable', 'ReSharper disable', '\\[ExcludeFromCodeCoverage', '\\[SuppressMessage', '#nullable disable',
  '<NoWarn>', 'severity *= *none', '//nolint',
  // Rust. This script owns the list of what counts as a Rust suppression; the guards-rust pack points here rather
  // than keeping its own. Here: allow and expect attributes, outer or inner, bare or under cfg_attr; -A, --allow, a
  // new --force-warn ratchet entry, and --cap-lints. Below and in FILE_SUPPRESSIONS: RUSTSEC advisory ignores, an
  // "allow" level in Cargo.toml, and a cargo-deny [bans] skip or skip-tree entry.
  '#!?\\[(?:allow|expect)\\(', '#!?\\[cfg_attr\\(.*\\b(?:allow|expect)\\(',
  `(?:^|[^\\w-])(?:-A|--allow|--force-warn)[\\s"',=]*${RUST_LINT}`, `--cap-lints[\\s"',=]+(?:allow|warn)\\b`,
  // A RUSTSEC advisory ignored on the cargo-audit command line, or in the rustsec audit-check action's input.
  `--ignore[\\s=]+["']?RUSTSEC-\\d{4}-\\d{4}`, `\\bignore:\\s*["']?RUSTSEC-\\d{4}-\\d{4}`,
].join('|'));
// Lines of a cargo-deny config that hold an entry of `skip` or `skip-tree` in the [bans] table (or the dotted
// `bans.skip` keys at the top level): each exempts a crate from the duplicate-version check. It needs the whole file,
// because in a multi-line array an entry line carries no key and looks exactly like a [bans] `deny` entry. An empty
// `skip = []` adds nothing and stays quiet.
const bansSkipLines = (src) => {
  const hits = new Set();
  let table = '';
  let depth = 0; // bracket depth inside a multi-line array value, 0 outside one
  let inSkip = false;
  const count = (s, c) => s.split(c).length - 1;
  const hasEntry = (s) => /[^\s[\],]/.test(s);
  src.split(/\r?\n/).forEach((raw, i) => {
    const code = raw.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '"s"').replace(/#.*/, '');
    if (depth === 0) {
      const header = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*$/.exec(code);
      if (header) { table = header[1].replace(/\s+/g, ''); return; }
      const kv = /^\s*([\w.-]+)\s*=(.*)$/.exec(code);
      if (!kv) return;
      inSkip = /^bans\.skip(?:-tree)?$/.test(table ? `${table}.${kv[1]}` : kv[1]);
      if (inSkip && hasEntry(kv[2].replace(/^\s*\[/, ''))) hits.add(i + 1);
      depth = Math.max(0, count(kv[2], '[') - count(kv[2], ']'));
    } else {
      if (inSkip && hasEntry(code)) hits.add(i + 1);
      depth = Math.max(0, depth + count(code, '[') - count(code, ']'));
    }
    if (depth === 0) inSkip = false;
  });
  return hits;
};
const fileLines = new Map();
const bansSkipAt = (f, line) => {
  if (!fileLines.has(f)) fileLines.set(f, bansSkipLines(existsSync(f) ? readFileSync(f, 'utf8') : ''));
  return fileLines.get(f).has(line);
};
// Suppressions that only mean one in a particular file: [file pattern, line pattern, or a test of (text, line, file)
// for one that depends on where in the file the line sits].
const FILE_SUPPRESSIONS = [
  [/(^|\/)Cargo\.toml$/, /=\s*["']allow["']/], // an "allow" level in [lints] or [workspace.lints]
  [/(^|\/)(deny|audit)\.toml$/, /^(?!\s*#).*RUSTSEC-\d{4}-\d{4}/], // an advisory ignore entry (comment lines excepted)
  [/(^|\/)deny\.toml$/, (text, line, f) => line != null && bansSkipAt(f, line)], // a [bans] skip or skip-tree entry
];
const fileSuppression = (f, line, text) =>
  FILE_SUPPRESSIONS.some(([fre, test]) => fre.test(f) && (test instanceof RegExp ? test.test(text) : test(text, line, f)));
const STUBS = new RegExp([
  'throw new (Error|NotImplemented\\w*)\\(.*[Nn]ot implemented', 'throw new NotImplementedException',
  'catch *(\\([^)]*\\))? *\\{ *\\}', '\\bTODO\\b', '\\bFIXME\\b', '\\bpass *# *stub', 'raise NotImplementedError',
  'unimplemented!\\(', 'todo!\\(',
].join('|'));
const SKIPS = new RegExp([
  '\\.(skip|todo|only)\\(', '\\bx(it|describe|test)\\(', '@pytest\\.mark\\.skip', '\\bt\\.Skip\\(', '@Disabled',
  '\\[(Fact|Theory|Test|TestMethod)\\([^\\]]*Skip *=', '\\[Ignore', '\\[Explicit',
].join('|'));
const SECRETS = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bsk-[A-Za-z0-9_-]{20,}\b/;
const TEST_FILE = /(\.|_)(test|spec)s?\.|(^|\/)test_|Tests?\.cs$|(^|\/)(tests?|__tests__)\//i;
const ASSERTION = /\b(expect|assert|Assert|should|Should|Verify|Received)\b/;
const CONSTRAINTS = /(^|\/)CONSTRAINTS\.md$/;

const policyFiles = new Map();
for (const { file: f, line, text } of added) {
  if (!policyFiles.has(f)) {
    try { policyFiles.set(f, policyLines(f, readFileSync(f, 'utf8'))); }
    catch {
      console.error(`floor-guard: could not inspect ${f}`);
      report('error', { reason: 'could not inspect added file', file: f });
      process.exit(2);
    }
  }
  const view = policyFiles.get(f)?.[line - 1];
  if (view && (SUPPRESSIONS.test(view.policy) || fileSuppression(f, line, view.policy))) flag('silenced-checker', f, line, text);
  if (view && STUBS.test(view.policy)) flag('unfinished-work', f, line, text);
  if (view && SKIPS.test(view.tests)) flag('test-made-easier', f, line, text);
  if (SECRETS.test(text)) flag('secret-in-diff', f, line, text, true);
  if (CONSTRAINTS.test(f) && /^\| *(W|E)\d+ *\|/.test(text)) flag('new-exception', f, line, text);
}

// Assertions removed from test files; whole test files deleted.
const deletedFiles = new Set(
  (git(['diff', '--name-only', '--diff-filter=D', mergeBase, '--']) ?? '').split('\n').filter(Boolean),
);
for (const { file: f, text } of removed) {
  if (TEST_FILE.test(f) && !deletedFiles.has(f) && ASSERTION.test(text)) flag('assertion-removed', f, null, text);
}
for (const f of deletedFiles) if (TEST_FILE.test(f)) flag('test-file-deleted', f, null, '(file deleted)');

// Weakened thresholds on a CONSTRAINTS.md row. Each number carries a direction read from the words just before
// it ("≤ 300", "max 5", "at most"), or from the row ("must not grow", "never lower"): a maximum is weakened when it
// rises, a minimum (the default, as for "Coverage | 80") when it falls. A row that keeps fewer numbers lost a
// threshold. Numbers pair in order; a row that gained numbers pairs only its first ones.
const MAX_CUE = /(?:≤|<=|<|\bat most|\bmax(?:imum)?\b|\bunder|\bbelow|\bno more than|\bup to|\bcap(?:ped)?(?: at)?)\s*$/i;
const MIN_CUE = /(?:≥|>=|>|\bat least|\bmin(?:imum)?\b|\bno less than|\bover|\babove)\s*$/i;
const ROW_MAX = /must not (?:grow|rise|exceed|increase)|never (?:raise|higher|grow)/i;
const ROW_MIN = /must not (?:fall|drop|decrease)|never (?:lower|fall)|ratchet/i;
const thresholds = (s) => [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => {
  const before = s.slice(Math.max(0, m.index - 16), m.index);
  const dir = MAX_CUE.test(before) ? 'max' : MIN_CUE.test(before) ? 'min' : ROW_MAX.test(s) ? 'max' : 'min';
  return { n: Number(m[0]), dir };
});
const key = (s) => s.split(/[|:]/).map((x) => x.trim()).filter(Boolean)[0] ?? '';
const addedC = added.filter((l) => CONSTRAINTS.test(l.file));
for (const r of removed.filter((l) => CONSTRAINTS.test(l.file))) {
  const a = addedC.find((x) => key(x.text) === key(r.text));
  if (!a) {
    if (/^\s*[-*] /.test(r.text)) flag('floor-rule-removed', r.file, null, r.text);
    continue;
  }
  const was = thresholds(r.text), now = thresholds(a.text);
  const shown = `${r.text.trim()}  ->  ${a.text.trim()}`;
  if (now.length < was.length) { flag('threshold-removed', r.file, a.line, shown); continue; }
  if (was.some((o, i) => (o.dir === 'max' ? now[i].n > o.n : now[i].n < o.n))) flag('threshold-lowered', r.file, a.line, shown);
}

// Curated files collapsed: a hand-maintained record losing most of itself in one change is usually an
// accidental overwrite, not an edit.
const CURATED = /(^|\/)(CONSTRAINTS|CONTEXT|CONTEXT-MAP|AGENTS|CODING_STANDARDS)\.md$|(^|\/)docs\/(adr|agents|capabilities)\/.+\.md$|(^|\/)\.scratch\/[^/]+\/spec\.md$/;
const SHRINK_RATIO = 0.4; // flag when the file keeps less than 40% of its lines
const MIN_LINES = 10; // too small to judge
const lineCount = (s) => s.split('\n').filter((l) => l.trim()).length;
for (const f of (git(['diff', '--name-only', mergeBase, '--']) ?? '').split('\n').filter((x) => CURATED.test(x))) {
  const before = git(['show', `${mergeBase}:${f}`]);
  if (before == null || lineCount(before) < MIN_LINES) continue;
  const after = existsSync(f) ? readFileSync(f, 'utf8') : '';
  const kept = lineCount(after) / lineCount(before);
  if (kept < SHRINK_RATIO) flag('curated-file-shrunk', f, null, `${lineCount(before)} -> ${lineCount(after)} non-blank lines`);
}

if (findings.length === 0) {
  console.error(`floor-guard: clean (base ${base})`);
  report('clean', { base, findings });
  process.exit(0);
}
console.error(`floor-guard: ${findings.length} violation(s) against ${base}:`);
for (const f of findings) console.error(`  [${f.rule}] ${f.file}${f.line ? ':' + f.line : ''}: ${f.text}`);
console.error('\nEach one lowers the bar. Fix the code, or record an owned, dated exception in CONSTRAINTS.md.');
report('violations', { base, findings });
process.exit(1);
