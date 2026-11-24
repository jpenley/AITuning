#!/usr/bin/env node
// A file-level import map of a codebase, for orienting in it: which files depend on which, the likely entry points,
// the most depended-on files, dependency cycles, and a reading order that walks out from the entry points.
// Deterministic and dependency-free: regexes over import statements, resolved to files in the repo. It maps
// structure; what the code means is still read from the files themselves.
//
//   node map.mjs [<dir>] [--focus <path>] [--save] [--limit 25]
//   node map.mjs [<dir>] --check          is the saved map (.scratch/trace/map.json) still current?
//   node map.mjs --selftest
// Languages: JavaScript/TypeScript, Python, Go, Rust, C# (by namespace), Java (by package). Files come from
// `git ls-files` when <dir> is a git repo, otherwise a walk that skips dependency and build folders.
// --focus lists one file's imports and importers. --save writes .scratch/trace/map.json stamped with the commit.
// Exit: 0 done (or the saved map is current), 1 the saved map is stale, 2 couldn't run.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, relative, extname, basename, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const log = (s = '') => process.stderr.write(s + '\n');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor', 'bin', 'obj', '.venv', 'venv', '__pycache__', 'coverage', '.next', '.turbo', 'external']);
const CODE = /\.(m?[jt]sx?|cjs|cts|mts|py|go|rs|cs|java)$/;
const JS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const git = (cwd, args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); return r.status === 0 ? r.stdout : null; };

export function listFiles(root) {
  const tracked = git(root, ['ls-files', '-co', '--exclude-standard']);
  if (tracked !== null) return tracked.split('\n').filter((f) => f && CODE.test(f) && !f.split('/').some((p) => SKIP_DIRS.has(p)));
  const out = [];
  const walk = (d) => { for (const e of readdirSync(join(root, d), { withFileTypes: true })) { const p = d ? `${d}/${e.name}` : e.name; if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(p); } else if (CODE.test(e.name)) out.push(p); } };
  walk('');
  return out;
}

export function buildMap(root) {
  const files = listFiles(root).sort();
  const set = new Set(files);
  const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(root, f), 'utf8')]));
  const edges = new Map(files.map((f) => [f, new Set()]));
  const add = (from, to) => { if (to && to !== from && set.has(to)) edges.get(from).add(to); };
  const goMod = existsSync(join(root, 'go.mod')) ? (readFileSync(join(root, 'go.mod'), 'utf8').match(/^module\s+(\S+)/m) || [])[1] : null;
  const csNs = new Map(), javaPkg = new Map();
  for (const f of files) {
    if (f.endsWith('.cs')) for (const m of src[f].matchAll(/^\s*namespace\s+([\w.]+)/gm)) (csNs.get(m[1]) ?? csNs.set(m[1], []).get(m[1])).push(f);
    if (f.endsWith('.java')) { const p = (src[f].match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1]; if (p) javaPkg.set(`${p}.${basename(f, '.java')}`, f); }
  }
  const jsResolve = (from, spec) => {
    if (!spec.startsWith('.')) return null;
    const base = posix.normalize(posix.join(posix.dirname(from), spec));
    const bare = base.replace(/\.(m?js|cjs)$/, '');
    for (const c of [base, ...JS_EXT.map((e) => bare + e), ...JS_EXT.map((e) => `${base}/index${e}`)]) if (set.has(c)) return c;
    return null;
  };
  const pyResolve = (from, mod, level) => {
    const baseDir = level ? posix.dirname(from).split('/').slice(0, Math.max(0, posix.dirname(from).split('/').length - (level - 1))).join('/') : '';
    const path = [baseDir, ...mod.split('.').filter(Boolean)].filter(Boolean).join('/');
    for (const c of [`${path}.py`, `${path}/__init__.py`]) if (set.has(c)) return c;
    if (!level) for (const f of files) if (f.endsWith(`/${path}.py`) || f.endsWith(`/${path}/__init__.py`)) return f;
    return null;
  };
  for (const f of files) {
    const s = src[f];
    if (/\.(m?[jt]sx?|cjs|cts|mts)$/.test(f)) {
      for (const m of s.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g)) add(f, jsResolve(f, m[1] ?? m[2] ?? m[3] ?? m[4]));
    } else if (f.endsWith('.py')) {
      for (const m of s.matchAll(/^\s*from\s+(\.*)([\w.]*)\s+import\s+([\w*, ]+)/gm)) {
        // "from pkg import core" may name a submodule (pkg/core.py) or a symbol in pkg: try submodules first.
        const level = m[1].length;
        const subs = m[3].split(',').map((x) => x.trim()).filter((x) => x && x !== '*').map((name) => pyResolve(f, `${m[2] ? m[2] + '.' : ''}${name}`, level)).filter(Boolean);
        if (subs.length) for (const t of subs) add(f, t);
        else add(f, pyResolve(f, m[2], level));
      }
      for (const m of s.matchAll(/^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm)) for (const mod of m[1].split(',')) add(f, pyResolve(f, mod.trim(), 0));
    } else if (f.endsWith('.go') && goMod) {
      for (const m of s.matchAll(/"([^"]+)"/g)) {
        if (!m[1].startsWith(goMod + '/')) continue;
        const dir = m[1].slice(goMod.length + 1);
        for (const g of files) if (g.endsWith('.go') && posix.dirname(g) === dir && !g.endsWith('_test.go')) add(f, g);
      }
    } else if (f.endsWith('.rs')) {
      const here = posix.dirname(f);
      const modDir = /(?:^|\/)(?:mod|lib|main)\.rs$/.test(f) ? here : `${here}/${basename(f, '.rs')}`;
      for (const m of s.matchAll(/^\s*(?:pub(?:\([\w ]+\))?\s+)?mod\s+(\w+)\s*;/gm)) for (const c of [`${modDir}/${m[1]}.rs`, `${modDir}/${m[1]}/mod.rs`]) add(f, set.has(c) ? c : null);
      const crateRoot = files.find((g) => /(?:^|\/)src\/(?:lib|main)\.rs$/.test(g) && f.startsWith(posix.dirname(g))) ?? null;
      if (crateRoot) for (const m of s.matchAll(/\buse\s+crate::([\w:]+)/g)) {
        const parts = m[1].split('::');
        for (let n = parts.length; n > 0; n--) { const p = `${posix.dirname(crateRoot)}/${parts.slice(0, n).join('/')}`; const c = [`${p}.rs`, `${p}/mod.rs`].find((x) => set.has(x)); if (c) { add(f, c); break; } }
      }
    } else if (f.endsWith('.cs')) {
      for (const m of s.matchAll(/^\s*using\s+(?:static\s+)?([\w.]+)\s*;/gm)) for (const g of csNs.get(m[1]) ?? []) add(f, g);
    } else if (f.endsWith('.java')) {
      for (const m of s.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm)) add(f, javaPkg.get(m[1]) ?? javaPkg.get(m[1].split('.').slice(0, -1).join('.')) ?? null);
    }
  }
  const fanIn = new Map(files.map((f) => [f, 0]));
  for (const [, tos] of edges) for (const t of tos) fanIn.set(t, fanIn.get(t) + 1);
  // Entry points: what a manifest names, conventional entry files, then files nothing imports that import others.
  const named = new Set();
  const pkg = existsSync(join(root, 'package.json')) ? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) : null;
  const pkgPaths = pkg ? [pkg.main, pkg.module, ...(typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {})), ...Object.values(pkg.scripts ?? {}).flatMap((s) => (String(s).match(/[\w./-]+\.(?:m?[jt]sx?|cjs)/g) ?? []))] : [];
  for (const p of pkgPaths) { if (!p) continue; const n = posix.normalize(p).replace(/^\.\//, ''); const c = set.has(n) ? n : jsResolve('x', `./${n}`); if (c) named.add(c); }
  const CONVENTIONAL = /(?:^|\/)(?:main|index|app|server|cli|__main__|manage|Program)\.\w+$|(?:^|\/)cmd\/[^/]+\/main\.go$|(?:^|\/)src\/(?:main|lib)\.rs$/;
  const entries = [...new Set([...named, ...files.filter((f) => CONVENTIONAL.test(f) && !/test|spec/i.test(f)), ...files.filter((f) => fanIn.get(f) === 0 && edges.get(f).size > 0 && !/test|spec|\.d\.ts$/i.test(f))])];
  // Reading order: breadth-first from each entry point, then the rest by how much depends on them.
  const order = [], seen = new Set();
  for (const e of entries) {
    const q = [e];
    while (q.length) { const f = q.shift(); if (seen.has(f)) continue; seen.add(f); order.push(f); for (const t of [...edges.get(f)].sort((a, b) => fanIn.get(b) - fanIn.get(a))) q.push(t); }
  }
  for (const f of [...files].sort((a, b) => fanIn.get(b) - fanIn.get(a))) if (!seen.has(f)) order.push(f);
  // Cycles: strongly connected components larger than one file (Tarjan).
  let idx = 0; const st = [], on = new Set(), index = new Map(), low = new Map(), cycles = [];
  const strong = (v) => {
    index.set(v, idx); low.set(v, idx); idx++; st.push(v); on.add(v);
    for (const w of edges.get(v)) { if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w))); }
    if (low.get(v) === index.get(v)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v); if (comp.length > 1) cycles.push(comp.sort()); }
  };
  for (const f of files) if (!index.has(f)) strong(f);
  const edgeCount = [...edges.values()].reduce((n, s) => n + s.size, 0);
  return {
    files: files.length, edges: edgeCount,
    entries, order,
    mostImported: [...fanIn].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([file, importedBy]) => ({ file, importedBy })),
    cycles,
    graph: Object.fromEntries([...edges].map(([f, t]) => [f, [...t].sort()])),
  };
}

function parseArgs(argv) {
  const pos = [], opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--selftest', '--save', '--check'].includes(a)) opts[a.slice(2)] = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else pos.push(a);
  }
  return { pos, opts };
}

export function run(argv, { out = (s) => process.stdout.write(s + '\n'), err = log } = {}) {
  const { pos, opts } = parseArgs(argv);
  const root = resolve(pos[0] ?? '.');
  if (!existsSync(root) || !statSync(root).isDirectory()) { err(`Not a folder: ${root}`); return 2; }
  const saved = join(root, '.scratch', 'trace', 'map.json');
  if (opts.check) {
    if (!existsSync(saved)) { err('No saved map (.scratch/trace/map.json). Run with --save to make one.'); return 2; }
    const m = JSON.parse(readFileSync(saved, 'utf8'));
    const changed = m.commit ? (git(root, ['diff', '--name-only', m.commit, '--', '.']) ?? '').split('\n').filter((f) => f && CODE.test(f)) : [];
    const dirty = (git(root, ['status', '--porcelain']) ?? '').split('\n').map((l) => l.slice(3)).filter((f) => f && CODE.test(f));
    const stale = [...new Set([...changed, ...dirty])];
    err(stale.length ? `Stale: ${stale.length} code file(s) changed since the map was made at ${m.commit ?? 'an unknown commit'}` : `Current (made at ${m.commit})`);
    out(JSON.stringify({ status: stale.length ? 'stale' : 'current', commit: m.commit, changed: stale.slice(0, 50) }));
    return stale.length ? 1 : 0;
  }
  const map = buildMap(root);
  const limit = Number(opts.limit ?? 25);
  if (opts.focus) {
    const f = relative(root, resolve(opts.focus)).replaceAll('\\', '/');
    if (!map.graph[f]) { err(`${f} is not a mapped code file`); return 2; }
    const importers = Object.entries(map.graph).filter(([, t]) => t.includes(f)).map(([g]) => g);
    err(`${f}: imports ${map.graph[f].length}, imported by ${importers.length}`);
    out(JSON.stringify({ status: 'ok', file: f, imports: map.graph[f], importedBy: importers }));
    return 0;
  }
  if (opts.save) {
    mkdirSync(dirname(saved), { recursive: true });
    const commit = (git(root, ['rev-parse', '--short', 'HEAD']) ?? '').trim() || null;
    writeFileSync(saved, JSON.stringify({ commit, made: new Date().toISOString(), ...map }, null, 1));
    err(`Saved ${saved} at ${commit ?? 'no commit'}`);
  }
  err(`${map.files} code files, ${map.edges} import edges, ${map.cycles.length} cycle(s)`);
  err(`entry points: ${map.entries.slice(0, 8).join(', ') || 'none found'}`);
  err(`most imported: ${map.mostImported.slice(0, 6).map((x) => `${x.file} (${x.importedBy})`).join(', ') || 'none'}`);
  const { graph, ...summary } = map;
  out(JSON.stringify({ status: 'ok', ...summary, order: summary.order.slice(0, limit), mostImported: summary.mostImported.slice(0, limit), entries: summary.entries.slice(0, limit) }));
  return 0;
}

function selftest() {
  const problems = [];
  const tmp = mkdtempSync(join(tmpdir(), 'trace-map-'));
  const put = (f, s) => { mkdirSync(dirname(join(tmp, f)), { recursive: true }); writeFileSync(join(tmp, f), s); };
  try {
    put('package.json', JSON.stringify({ name: 'x', main: 'src/index.ts' }));
    put('src/index.ts', "import { route } from './routes/auth';\nimport cfg from './config.js';\nexport const app = route(cfg);\n");
    put('src/routes/auth.ts', "import { issue } from '../tokens';\nimport { db } from '../db';\nexport const route = () => issue(db);\n");
    put('src/tokens.ts', "import { db } from './db';\nexport const issue = () => db;\n");
    put('src/db/index.ts', "import { issue } from '../tokens';\nexport const db = 1; export const x = issue;\n");
    put('src/config.ts', 'export default {};\n');
    put('src/unused.ts', "import lodash from 'lodash';\nexport const z = 1;\n");
    put('py/pkg/__init__.py', '');
    put('py/pkg/core.py', 'from .util import helper\nimport os\n');
    put('py/pkg/util.py', 'def helper(): pass\n');
    put('py/__main__.py', 'from pkg import core\n');
    put('rs/src/main.rs', 'mod parser;\nuse crate::parser::Token;\nfn main() {}\n');
    put('rs/src/parser.rs', 'pub struct Token;\n');
    put('node_modules/dep/index.js', "require('./other')\n");
    const outs = [];
    const quiet = { out: (s) => outs.push(JSON.parse(s)), err: () => {} };
    run([tmp], quiet);
    const r = outs.at(-1);
    const m = buildMap(tmp);
    const has = (a, b) => m.graph[a]?.includes(b);
    if (!has('src/index.ts', 'src/routes/auth.ts') || !has('src/index.ts', 'src/config.ts')) problems.push('JS relative imports (including a .js specifier for a .ts file) not resolved');
    if (!has('src/routes/auth.ts', 'src/db/index.ts')) problems.push('a folder import must resolve to its index file');
    if (!has('py/pkg/core.py', 'py/pkg/util.py')) problems.push('Python relative import not resolved');
    if (!has('py/__main__.py', 'py/pkg/core.py')) problems.push('Python "from pkg import core" not resolved');
    if (!has('rs/src/main.rs', 'rs/src/parser.rs')) problems.push('Rust mod declaration not resolved');
    if (m.graph['node_modules/dep/index.js']) problems.push('node_modules must be skipped');
    if (r.entries[0] !== 'src/index.ts') problems.push(`the manifest's main must be the first entry point, got ${r.entries[0]}`);
    if (r.order[0] !== 'src/index.ts' || r.order.indexOf('src/routes/auth.ts') > r.order.indexOf('src/tokens.ts')) problems.push(`reading order should start at the entry and go breadth-first: ${r.order.slice(0, 5).join(' > ')}`);
    if (!m.cycles.some((c) => c.join() === 'src/db/index.ts,src/tokens.ts')) problems.push(`the tokens <-> db cycle was not found: ${JSON.stringify(m.cycles)}`);
    if (r.mostImported[0]?.file !== 'src/db/index.ts' && r.mostImported[0]?.file !== 'src/tokens.ts') problems.push(`most imported should be db or tokens, got ${r.mostImported[0]?.file}`);
    run([tmp, '--focus', join(tmp, 'src/tokens.ts')], quiet);
    if (outs.at(-1).importedBy.sort().join() !== 'src/db/index.ts,src/routes/auth.ts') problems.push('--focus importers wrong');
    if (run([tmp, '--check'], quiet) !== 2) problems.push('--check with no saved map must exit 2');
    spawnSync('git', ['init', '-q'], { cwd: tmp });
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'], { cwd: tmp });
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x'], { cwd: tmp });
    run([tmp, '--save'], quiet);
    if (!existsSync(join(tmp, '.scratch', 'trace', 'map.json'))) problems.push('--save must write .scratch/trace/map.json');
    if (run([tmp, '--check'], quiet) !== 0) problems.push('a map saved at HEAD must be current');
    put('src/tokens.ts', "import { db } from './db';\nexport const issue = () => db + 1;\n");
    if (run([tmp, '--check'], quiet) !== 1 || !outs.at(-1).changed.includes('src/tokens.ts')) problems.push('an edited file must make the map stale');
  } finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  log(`map --selftest: ${problems.length} problem(s)`);
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
