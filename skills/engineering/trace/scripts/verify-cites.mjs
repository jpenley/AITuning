#!/usr/bin/env node
// Checks the citations in an explanation of code or of a body of material against the files themselves: does the
// cited file exist under the root, is the line (or range) inside it, is the cited line more than blank, and does a
// quoted passage next to the citation actually appear at (or within two lines of) that place. It reads only local
// files; no network, no packages.
//
//   node verify-cites.mjs <explanation.md> [--root <dir>]     the explanation to check (default root: the current folder)
//   node verify-cites.mjs - [--root <dir>]                     read the explanation from stdin
//   node verify-cites.mjs --selftest
// Citation forms it checks (fenced code blocks are skipped):
//   `src/routes/auth.ts:12`    `src/a.ts:12-20`    `auth.ts:12` (a bare file name must match exactly one file under the root)
//   `src/a.ts:12` "the quoted text"      the quote is checked against the cited lines +/- 2
//   notes/smith.md "the quoted text"     a file and a passage, for material without line numbers
// Text that only looks like a citation (a URL, host:port, a time, a version like v1.2:3) is not one.
// Output: JSON on stdout: { status, root, checked, counts, results }. Each result: { citation, file, line, endLine,
//   at, verdict, detail, quote?, foundAt? } where `at` is the line of the explanation it came from. verdict is one of
//   ok, missing-file, ambiguous, outside-root, out-of-range, bad-range, blank-line, quote-mismatch, binary, too-large.
//   status is clean, findings, or no-citations (an explanation with no checkable citation is a finding: an explanation
//   checked with this script is expected to cite its sources).
// Exit: 0 clean, 1 findings, 2 couldn't run (no input, unreadable file, bad root). Never read 2 as clean.
import { readFileSync, readdirSync, statSync, realpathSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, relative, join, basename, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const log = (s = '') => process.stderr.write(s + '\n');
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_INDEX = 100000;
const TLDS = new Set(['com', 'org', 'net', 'io', 'dev', 'app', 'ai', 'co', 'edu', 'gov', 'local', 'localhost', 'info', 'me', 'us', 'uk', 'de']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '__pycache__', '.venv', 'dist', 'build', 'target']);

const PATH = "(?:\\.{0,2}/)?(?:[\\w.@+-]+/)*[\\w.@+-]*[A-Za-z][\\w.@+-]*\\.[A-Za-z][A-Za-z0-9]{0,7}";
// A citation does not start right after a word character, "/", "@", ".", ":" or "\" (so "host:3000/x.js:12" is not one).
const LINE_CITE = new RegExp(`(?<![\\w/@.:\\\\-])(${PATH}):(?:L)?(\\d+)(?:[-–](?:L)?(\\d+))?(?![\\w])`, 'g');
const FILE_QUOTE = new RegExp(`(?<![\\w/@.:\\\\-])(${PATH})(?![\\w:])[\\s:—–,-]{0,3}["“]([^"”\\n]{4,200})["”]`, 'g');
const QUOTE_AFTER = /^[\s`:—–,-]{0,4}["“]([^"”\n]{4,200})["”]/;

// The citations in a text, in order, with the line of the text each came from. Fenced blocks are skipped.
export function extractCitations(text) {
  const out = [];
  let fence = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) { fence = fence ? (f[1][0] === fence[0] && f[1].length >= fence.length ? null : fence) : f[1]; return; }
    if (fence) return;
    const taken = [];
    for (const m of line.matchAll(LINE_CITE)) {
      const q = line.slice(m.index + m[0].length).match(QUOTE_AFTER);
      out.push({ citation: m[0], token: m[1], line: Number(m[2]), endLine: m[3] ? Number(m[3]) : null, quote: q?.[1] ?? null, at: i + 1 });
      taken.push([m.index, m.index + m[0].length]);
    }
    for (const m of line.matchAll(FILE_QUOTE)) {
      if (taken.some(([a, b]) => m.index >= a && m.index < b)) continue;
      out.push({ citation: m[0], token: m[1], line: null, endLine: null, quote: m[2], at: i + 1 });
    }
  });
  return out;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

function indexTree(root) {
  const byName = new Map();
  let n = 0;
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (n >= MAX_INDEX) return;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name)); continue; }
      n++;
      (byName.get(e.name) ?? byName.set(e.name, []).get(e.name)).push(join(dir, e.name));
    }
  };
  walk(root);
  return byName;
}

// Check every citation against the files under `root`. Returns { results, counts }.
export function verify(citations, root) {
  const realRoot = realpathSync(root);
  let index = null;
  const cache = new Map();
  const readLines = (p) => {
    if (cache.has(p)) return cache.get(p);
    let r;
    const st = statSync(p);
    if (!st.isFile()) r = { error: 'missing-file', detail: 'not a file' };
    else if (st.size > MAX_BYTES) r = { error: 'too-large', detail: `${st.size} bytes` };
    else {
      const buf = readFileSync(p);
      if (buf.includes(0)) r = { error: 'binary', detail: 'binary file' };
      else {
        const lines = buf.toString('utf8').split(/\r?\n/);
        if (lines.at(-1) === '') lines.pop();
        r = { lines };
      }
    }
    cache.set(p, r);
    return r;
  };
  const results = citations.map((c) => {
    const res = { citation: c.citation, file: c.token, line: c.line, endLine: c.endLine, at: c.at, verdict: 'ok', detail: '' };
    if (c.quote) res.quote = c.quote;
    const fail = (verdict, detail) => Object.assign(res, { verdict, detail });
    let path = resolve(root, c.token);
    let exists = false;
    try { exists = statSync(path).isFile(); } catch { /* not there */ }
    if (!exists && !c.token.includes('/')) {
      index ??= indexTree(root);
      const hits = index.get(basename(c.token)) ?? [];
      if (hits.length === 1) { path = hits[0]; exists = true; res.file = relative(root, path).replace(/\\/g, '/'); }
      else if (hits.length > 1) return fail('ambiguous', `${hits.length} files named ${c.token}: ${hits.slice(0, 4).map((h) => relative(root, h).replace(/\\/g, '/')).join(', ')}; cite the full path`);
      else if (TLDS.has(c.token.split('.').pop().toLowerCase())) return null; // example.com:8080 is a host, not a file
    }
    if (!exists) return fail('missing-file', `no file ${c.token} under ${root}`);
    const real = realpathSync(path);
    const rel = relative(realRoot, real);
    if (rel.startsWith('..') || isAbsolute(rel)) return fail('outside-root', 'the file is outside the root');
    const f = readLines(real);
    if (f.error) return fail(f.error, f.detail);
    const { lines } = f;
    const total = lines.length;
    if (c.line !== null) {
      const end = c.endLine ?? c.line;
      if (c.line < 1 || end < c.line) return fail('bad-range', `${c.citation}: the range runs backwards or starts before line 1`);
      if (end > total) return fail('out-of-range', `${res.file} has ${total} line${total === 1 ? '' : 's'}`);
      if (c.endLine === null && !c.quote && lines[c.line - 1].trim() === '') return fail('blank-line', `line ${c.line} of ${res.file} is blank`);
    }
    if (c.quote) {
      const want = norm(c.quote);
      const lo = c.line === null ? 0 : Math.max(0, c.line - 1 - 2);
      const hi = c.line === null ? total : Math.min(total, (c.endLine ?? c.line) + 2);
      if (!norm(lines.slice(lo, hi).join(' ')).includes(want)) {
        let foundAt = null;
        // The line where the quote begins: it may run over the next few lines, and must start inside line k.
        for (let k = 0; k < total && foundAt === null; k++) {
          const at = norm(lines.slice(k, k + 4).join(' ')).indexOf(want);
          if (at >= 0 && at < norm(lines[k]).length) foundAt = k + 1;
        }
        res.foundAt = foundAt;
        return fail('quote-mismatch', foundAt ? `the quote is at line ${foundAt}, not near ${c.line ?? 'the file'}` : `the quote does not appear in ${res.file}`);
      }
    }
    return res;
  }).filter(Boolean);
  const counts = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  return { results, counts };
}

export function check(text, root) {
  const { results, counts } = verify(extractCitations(text), root);
  const bad = results.filter((r) => r.verdict !== 'ok');
  const status = results.length === 0 ? 'no-citations' : bad.length ? 'findings' : 'clean';
  return { status, root, checked: results.length, counts, results };
}

// ---------- selftest ----------

function selftest() {
  const problems = [];
  const want = (name, ok, detail = '') => { if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`); };
  const dir = mkdtempSync(join(tmpdir(), 'verify-cites-'));
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'x'), { recursive: true });
    mkdirSync(join(dir, 'y'), { recursive: true });
    writeFileSync(join(dir, 'a.txt'), 'alpha\nbeta\n\ngamma delta\n');
    writeFileSync(join(dir, 'src', 'b.js'), 'one\ntwo\nthree\n');
    writeFileSync(join(dir, 'x', 'c.js'), 'x\n');
    writeFileSync(join(dir, 'y', 'c.js'), 'y\n');
    writeFileSync(join(dir, 'crlf.txt'), 'one\r\ntwo\r\nthree\r\n');
    writeFileSync(join(dir, 'bin.dat.txt'), Buffer.from([65, 0, 66, 10]));
    const outside = join(dir, '..', 'verify-cites-outside.txt');
    writeFileSync(outside, 'secret\n');
    const verdicts = (text) => check(text, dir).results.map((r) => r.verdict);
    const one = (text) => check(text, dir).results[0]?.verdict;

    want('a line inside the file is ok', one('See `src/b.js:2`.') === 'ok');
    want('a range inside the file is ok', one('See `src/b.js:2-3`.') === 'ok');
    want('a line past the end is out-of-range', one('See `src/b.js:9`.') === 'out-of-range');
    want('the last line counts, a trailing newline adds none', one('See `src/b.js:4`.') === 'out-of-range' && one('See `src/b.js:3`.') === 'ok');
    want('a reversed range is bad-range', one('See `src/b.js:3-2`.') === 'bad-range');
    want('a missing file is missing-file', one('See `src/nope.js:1`.') === 'missing-file');
    want('a blank cited line is blank-line', one('See `a.txt:3`.') === 'blank-line');
    want('a matching quote is ok', one('See `a.txt:4` "gamma delta".') === 'ok');
    writeFileSync(join(dir, 'long.txt'), Array.from({ length: 10 }, (_, k) => `row ${k + 1}`).join('\n') + '\n');
    const mismatch = check('See `long.txt:10` "row 2".', dir).results[0];
    want('a quote from a distant line is quote-mismatch and says where', mismatch.verdict === 'quote-mismatch' && mismatch.foundAt === 2, JSON.stringify(mismatch));
    want('a quote nowhere in the file is quote-mismatch', check('See `a.txt:4` "omega".', dir).results[0].foundAt === null);
    want('a quote within two lines of the cite is ok', one('See `long.txt:10` "row 8".') === 'ok');
    want('a quote three lines away is not', one('See `long.txt:10` "row 7".') === 'quote-mismatch');
    want('a file and passage with no line is ok', one('From notes: a.txt "gamma delta" says so.') === 'ok');
    want('a file and passage that is not there is quote-mismatch', one('a.txt "omega and more"') === 'quote-mismatch');
    want('a bare file name matching one file resolves', one('See `b.js:1`.') === 'ok');
    want('a bare file name matching two files is ambiguous', one('See `c.js:1`.') === 'ambiguous');
    want('a path leaving the root is not followed', one('See `../verify-cites-outside.txt:1`.') === 'outside-root');
    want('CRLF lines count once each', one('See `crlf.txt:3`.') === 'ok' && one('See `crlf.txt:4`.') === 'out-of-range');
    want('a binary file is binary', one('See `bin.dat.txt:1`.') === 'binary');
    const looks = check('Serve on example.com:8080 or http://localhost:3000/x.js:12 at 10:30, version v1.2:3, 10.0.0.1:8080.', dir);
    want('URLs, ports, times and versions are not citations', looks.status === 'no-citations' && looks.checked === 0, JSON.stringify(looks.results));
    want('a fenced block is skipped', check('Clean.\n\n```\n`src/nope.js:1`\n```\n', dir).status === 'no-citations');
    want('a citation after a fence still counts', verdicts('```\nx\n```\nSee `src/b.js:1`.').join() === 'ok');
    want('two citations on a line are both checked', verdicts('`src/b.js:1` and `src/b.js:99`').join() === 'ok,out-of-range');
    want('the line the citation came from is reported', check('one\n\nSee `src/b.js:9`.\n', dir).results[0].at === 3);
    want('no citations is a finding, not clean', check('It works well.', dir).status === 'no-citations');
    want('a clean explanation is clean', check('`src/b.js:1` and `a.txt:1-2`', dir).status === 'clean');

    // exit codes through the real CLI
    const self = fileURLToPath(import.meta.url);
    const run = (args, input) => spawnSync(process.execPath, [self, ...args], { encoding: 'utf8', input, cwd: dir });
    writeFileSync(join(dir, 'good.md'), 'See `src/b.js:1`.\n');
    writeFileSync(join(dir, 'bad.md'), 'See `src/b.js:99`.\n');
    const good = run(['good.md']);
    want('CLI: clean exits 0 with JSON', good.status === 0 && JSON.parse(good.stdout).status === 'clean', `${good.status} ${good.stdout}`);
    const bad = run(['bad.md']);
    want('CLI: findings exit 1', bad.status === 1 && JSON.parse(bad.stdout).counts['out-of-range'] === 1, `${bad.status}`);
    want('CLI: stdin works', run(['-'], 'See `src/b.js:1`.').status === 0);
    want('CLI: a missing explanation file exits 2', run(['nope.md']).status === 2);
    want('CLI: no argument exits 2', run([]).status === 2);
    want('CLI: a bad root exits 2', run(['good.md', '--root', join(dir, 'missing')]).status === 2);
    want('CLI: --root changes what is checked', run(['good.md', '--root', join(dir, 'x')]).status === 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(join(tmpdir(), 'verify-cites-outside.txt'), { force: true });
  }
  log(`verify-cites --selftest: ${problems.length} problem(s)`);
  for (const p of problems) log(`  ✗ ${p}`);
  process.stdout.write(JSON.stringify({ status: problems.length ? 'fail' : 'ok', problems }) + '\n');
  return problems.length ? 1 : 0;
}

// ---------- main ----------

function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  const rootIdx = argv.indexOf('--root');
  const root = resolve(rootIdx > -1 ? argv[rootIdx + 1] ?? '' : '.');
  const rest = argv.filter((a, i) => rootIdx === -1 || (i !== rootIdx && i !== rootIdx + 1));
  const input = rest.find((a) => a === '-' || !a.startsWith('--'));
  if (!input) { log('usage: node verify-cites.mjs <explanation.md | -> [--root <dir>]'); return 2; }
  try { if (!statSync(root).isDirectory()) throw new Error('not a folder'); } catch (e) { log(`verify-cites: root ${root}: ${e.message}`); return 2; }
  let text;
  try { text = input === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(input), 'utf8'); } catch (e) { log(`verify-cites: can't read ${input}: ${e.message}`); return 2; }
  const out = check(text, root);
  process.stdout.write(JSON.stringify(out) + '\n');
  for (const r of out.results.filter((x) => x.verdict !== 'ok')) log(`  ✗ line ${r.at}: ${r.citation}  ${r.verdict}: ${r.detail}`);
  if (out.status === 'no-citations') log('  ✗ no checkable citation found; every claim should cite file:line, or a file and a quoted passage');
  log(`verify-cites: ${out.checked} citation(s) checked, ${out.status}`);
  return out.status === 'clean' ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)));
