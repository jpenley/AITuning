#!/usr/bin/env node
// Builds the "No plugin install" package: a zip holding the skills named in manifest.json (plus every skill they
// depend on), a catalog describing them, the supporting tools, an installer, and a README that tells Claude how to
// run the install. For clients that allow custom skills but not plugins. No packages; Node 24 or later.
//
//   node tools/no-plugin/build.mjs [--manifest <file>] [--out <dir>] [--no-selftest]
// Output: JSON on stdout { status, zip, folder, skills, dependencyOnly, tools, softReferences }; progress on stderr.
// Exit: 0 built (and the packaged installer's selftest passed), 1 the manifest or a skill breaks a packaging rule,
// 2 couldn't run.
//
// Dependencies: a skill depends on another when it says "load the `x` skill" or links into the other skill's folder
// (`](../x/FILE.md)`); both are followed to a closure. A link that leaves the skills tree must be covered by a
// manifest rewrite, or the build fails: installed, that path would not exist. "Suggest the user run `x`" and plain
// mentions are soft references and are reported, not installed.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deflateRawSync, crc32 } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const log = (s) => process.stderr.write(`no-plugin build: ${s}\n`);
const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : undefined; };
const fail = (msg, code = 1, extra = {}) => { process.stdout.write(JSON.stringify({ status: 'error', error: msg, ...extra }, null, 2) + '\n'); process.exit(code); };
const posix = (p) => p.split(sep).join('/');

const git = (...a) => {
  const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) fail(`git ${a.join(' ')} failed: ${r.stderr.trim()}`, 2);
  return r.stdout;
};
const tracked = (path) => git('ls-files', '-z', '--', path).split('\0').filter(Boolean);

// ---------- read the skills tree ----------

// A YAML scalar as written in front matter: "double" (backslash escapes) or 'single' ('' is a quote) or plain.
const unquote = (v) => {
  if (v === undefined) return v;
  if (/^".*"$/.test(v)) return v.slice(1, -1).replace(/\\(["\\])/g, '$1');
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  return v;
};

export function readSkills() {
  const skills = new Map();
  for (const file of tracked('skills').filter((f) => f.endsWith('/SKILL.md'))) {
    const dir = dirname(file);
    const name = basename(dir);
    const text = readFileSync(join(ROOT, file), 'utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const field = (k) => unquote(fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim());
    if (skills.has(name)) fail(`two skills named "${name}": ${skills.get(name).dir} and ${dir}`);
    skills.set(name, { name, dir, description: field('description') ?? '', invoked: field('disable-model-invocation') === 'true', files: tracked(dir) });
  }
  for (const s of skills.values()) {
    const hard = new Set();
    const soft = new Set();
    const escapes = [];
    const shared = [];
    for (const f of s.files.filter((x) => x.endsWith('.md'))) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      for (const m of text.matchAll(/[Ll]oad(?:s|ing)? the `([a-z0-9-]+)` skill/g)) hard.add(m[1]);
      for (const m of text.matchAll(/\]\(\.\.\/([a-z0-9-]+)\/[^)\s]+\)/g)) if (skills.has(m[1])) hard.add(m[1]);
      for (const m of text.matchAll(/\]\(((?:\.\.\/){2,}[^)\s#]+)/g)) {
        // A link into a collection's shared/ folder is a shared reference; anything else leaves the skills tree.
        const target = posix(relative(ROOT, resolve(ROOT, dirname(f), m[1])));
        const entry = { file: posix(relative(s.dir, f)), link: m[1] };
        if (/^skills\/(?:[^/]+\/)*shared\/[^/]+$/.test(target)) shared.push({ ...entry, target });
        else escapes.push(entry);
      }
      for (const m of text.matchAll(/suggest the user run `([a-z0-9-]+)`|the `([a-z0-9-]+)` skill/g)) soft.add(m[1] ?? m[2]);
    }
    hard.delete(s.name);
    s.deps = [...hard].filter((d) => skills.has(d)).sort();
    s.soft = [...soft].filter((d) => skills.has(d) && d !== s.name && !hard.has(d)).sort();
    s.escapes = escapes;
    s.shared = shared;
  }
  return skills;
}

export function closure(skills, names) {
  const out = new Set();
  const visit = (n) => { if (out.has(n)) return; out.add(n); for (const d of skills.get(n).deps) visit(d); };
  names.forEach(visit);
  return out;
}

// ---------- zip (store + deflate, no packages) ----------

export function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(useDeflate ? 8 : 0, 10); cd.writeUInt16LE(dosTime, 12); cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

// ---------- build ----------

function build() {
  const manifestPath = resolve(argOf('--manifest') ?? join(HERE, 'manifest.json'));
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch (e) { fail(`cannot read manifest: ${e.message}`, 2); }
  const skills = readSkills();

  const listed = manifest.groups.flatMap((g) => g.skills);
  const problems = [];
  for (const n of listed) if (!skills.has(n)) problems.push(`manifest lists unknown skill "${n}"`);
  const dupes = listed.filter((n, i) => listed.indexOf(n) !== i);
  if (dupes.length) problems.push(`listed in more than one group: ${[...new Set(dupes)].join(', ')}`);
  if (!listed.includes('consult')) problems.push('the installer uses consult for its selection page: list it in a group');
  if (problems.length) fail('manifest invalid', 1, { problems });

  const included = closure(skills, listed);
  const dependencyOnly = [...included].filter((n) => !listed.includes(n)).sort();
  for (const n of Object.keys(manifest.needs ?? {})) if (!included.has(n)) problems.push(`needs entry for "${n}", which is not packaged`);
  for (const n of included) {
    for (const e of skills.get(n).escapes) {
      const rw = (manifest.rewrites ?? []).find((r) => r.skill === n && r.file === e.file && r.from === `](${e.link})`);
      if (!rw) problems.push(`${n}/${e.file} links outside the skills tree (${e.link}); add a manifest rewrite or remove the link`);
    }
  }
  for (const r of manifest.rewrites ?? []) {
    if (!included.has(r.skill)) continue;
    const text = readFileSync(join(ROOT, skills.get(r.skill).dir, r.file), 'utf8');
    if (!text.includes(r.from)) problems.push(`rewrite for ${r.skill}/${r.file}: "${r.from}" not found (the skill changed; update the manifest)`);
  }
  // Shared references the packaged skills link, plus the shared files those link in turn. They ship flat in the
  // package's shared/ folder, so two different files may not share a name.
  const sharedFiles = new Map(); // package name -> repo path
  const addShared = (target) => {
    const name = basename(target);
    if (sharedFiles.has(name)) {
      if (sharedFiles.get(name) !== target) problems.push(`two shared files named ${name}: ${sharedFiles.get(name)} and ${target}`);
      return;
    }
    if (!tracked(target).length) { problems.push(`shared reference ${target} is not a tracked file`); return; }
    sharedFiles.set(name, target);
    for (const m of readFileSync(join(ROOT, target), 'utf8').matchAll(/\]\(([^)\s#:/]+\.md)/g)) addShared(posix(join(dirname(target), m[1])));
  };
  for (const n of included) for (const e of skills.get(n).shared) addShared(e.target);
  if (problems.length) fail('packaging rules broken', 1, { problems });

  const version = manifest.version;
  const commit = git('rev-parse', '--short', 'HEAD').trim();
  const dirty = git('status', '--porcelain', '--', 'skills', 'evals', 'tools').trim() !== '';
  const outDir = resolve(argOf('--out') ?? join(HERE, 'dist'));
  const pkgName = `${manifest.name}-${version}`;
  const pkgDir = join(outDir, pkgName);
  rmSync(pkgDir, { recursive: true, force: true });
  mkdirSync(pkgDir, { recursive: true });

  const files = []; // [repo path, package path]
  for (const n of [...included].sort()) for (const f of skills.get(n).files) files.push([f, `skills/${n}/${posix(relative(skills.get(n).dir, f))}`]);
  if (manifest.tools.includes('evals')) for (const f of tracked('evals')) files.push([f, `tools/${f}`]);
  if (manifest.tools.includes('readiness')) for (const f of ['tools/readiness.mjs', 'tools/dependencies.json']) files.push([f, `tools/readiness/${basename(f)}`]);
  for (const [name, target] of sharedFiles) files.push([target, `shared/${name}`]);
  for (const f of ['LICENSE', 'THIRD_PARTY_NOTICES.md', ...tracked('LICENSES')]) files.push([f, f]);
  files.push([posix(relative(ROOT, join(HERE, 'package', 'install.mjs'))), 'install.mjs']);
  for (const [from, to] of files) {
    mkdirSync(dirname(join(pkgDir, to)), { recursive: true });
    copyFileSync(join(ROOT, from), join(pkgDir, to));
  }

  const groupOf = Object.fromEntries(manifest.groups.flatMap((g) => g.skills.map((n) => [n, g.id])));
  const catalog = {
    name: manifest.name, title: manifest.title, version, builtFrom: commit + (dirty ? '+local-changes' : ''), builtAt: new Date().toISOString(),
    install: manifest.install, tools: manifest.tools, groups: manifest.groups, rewrites: (manifest.rewrites ?? []).filter((r) => included.has(r.skill)),
    sharedFiles: [...sharedFiles.keys()].sort(),
    skills: Object.fromEntries([...included].sort().map((n) => {
      const s = skills.get(n);
      return [n, {
        description: s.description, invoked: s.invoked, group: groupOf[n] ?? null, deps: s.deps, softReferences: s.soft, needs: manifest.needs?.[n] ?? null,
        shared: s.shared.map((e) => ({ file: e.file, link: e.link, name: basename(e.target) })),
      }];
    })),
  };
  writeFileSync(join(pkgDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  const readme = readFileSync(join(HERE, 'package', 'README.md'), 'utf8')
    .replaceAll('{version}', version).replaceAll('{count}', String(included.size)).replaceAll('{listed}', String(listed.length));
  writeFileSync(join(pkgDir, 'README.md'), readme);

  if (!args.includes('--no-selftest')) {
    log('running the packaged installer selftest');
    const r = spawnSync(process.execPath, [join(pkgDir, 'install.mjs'), '--selftest'], { encoding: 'utf8', cwd: pkgDir });
    if (r.status !== 0) fail('packaged installer selftest failed', 1, { output: (r.stderr + r.stdout).trim().split('\n').slice(-20) });
  }

  const entries = [];
  const walk = (d) => {
    for (const e of readdirSorted(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else entries.push({ name: `${pkgName}/${posix(relative(pkgDir, p))}`, data: readFileSync(p) });
    }
  };
  walk(pkgDir);
  const zipPath = join(outDir, `${pkgName}.zip`);
  writeFileSync(zipPath, zip(entries));
  log(`wrote ${zipPath} (${entries.length} files, ${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB)`);

  const soft = {};
  for (const n of included) for (const r of skills.get(n).soft) if (!included.has(r)) (soft[r] ??= []).push(n);
  process.stdout.write(JSON.stringify({
    status: 'built', zip: zipPath, folder: pkgDir, builtFrom: catalog.builtFrom, skills: included.size, listed: listed.length,
    dependencyOnly, sharedFiles: catalog.sharedFiles, tools: manifest.tools, files: entries.length,
    softReferences: Object.fromEntries(Object.entries(soft).sort()),
  }, null, 2) + '\n');
}

function readdirSorted(d) { return readdirSync(d).sort(); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
