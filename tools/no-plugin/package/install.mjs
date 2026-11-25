#!/usr/bin/env node
// Installs skills from this package into Claude Code's user skills folder, without a plugin. Ships inside the
// package next to catalog.json, skills/ and tools/. No packages; Node 24 or later.
//
//   node install.mjs list
//   node install.mjs page --out <spec.json>
//   node install.mjs apply (--answers <answer.json> | --skills a,b,c) [--dry-run]
//                          [--dest <dir>] [--tools-dir <dir>] [--backup-dir <dir>]
//   node install.mjs --selftest
// list: the catalog as JSON (name, group, automatic or invoked, dependencies, requirements).
// page: writes a consult spec: one checklist per group, with the package's default groups ticked.
// apply: installs the chosen skills plus every skill they depend on. It copies them to a staging folder,
//   validates them with the bundled eval toolkit, installs the supporting tools, rewrites links that point at
//   those tools, backs up any existing folder with the same name, copies, then checks every file landed.
//   --answers takes a consult answer object (only status "submitted" installs); --dry-run reports the plan only.
//   Defaults come from catalog.json: skills to ~/.claude/skills, tools to ~/.claude/aituning, backups to
//   ~/.claude/skills-backup/<timestamp>/.
// Output: one JSON object on stdout; progress on stderr.
// Exit: 0 installed, planned (dry run) or nothing selected; 1 invalid input or the selection failed validation
//   (nothing installed); 2 the answers were not submitted, or the install couldn't run.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, cpSync, renameSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stderr.write(`install: ${s}\n`);
const posix = (p) => p.split(sep).join('/');
const expand = (p) => resolve(p.replace(/^~(?=$|[\\/])/, homedir()));
const loadCatalog = () => JSON.parse(readFileSync(join(HERE, 'catalog.json'), 'utf8'));

class InstallError extends Error { constructor(msg, code = 1, extra = {}) { super(msg); this.code = code; this.extra = extra; } }

export function closure(catalog, names) {
  const out = new Set();
  const visit = (n) => {
    if (out.has(n)) return;
    if (!catalog.skills[n]) throw new InstallError(`unknown skill "${n}"`, 1, { known: Object.keys(catalog.skills) });
    out.add(n);
    for (const d of catalog.skills[n].deps) visit(d);
  };
  names.forEach(visit);
  return out;
}

// ---------- page ----------

export function pageSpec(catalog) {
  const mode = (n) => (catalog.skills[n].invoked ? 'invoked' : 'automatic');
  const option = (n) => {
    const s = catalog.skills[n];
    const also = [...closure(catalog, [n])].filter((d) => d !== n);
    const lines = [s.description, '', s.invoked
      ? `**Invoked**: runs only when you type \`/${n}\`.`
      : `**Automatic**: Claude uses it when a request matches; you can also type \`/${n}\`.`];
    if (also.length) lines.push(`Also installs: ${also.map((d) => `\`${d}\``).join(', ')}.`);
    if (s.needs?.text) lines.push(`Needs: ${s.needs.text}`);
    return { id: n, label: `${n} (${mode(n)})`, detail: { markdown: lines.join('\n') } };
  };
  const pages = [];
  for (const g of catalog.groups) {
    let pg = pages.find((p) => p.title === g.page);
    if (!pg) pages.push(pg = { title: g.page, questions: [] });
    pg.questions.push(g.id);
  }
  const depOnly = Object.keys(catalog.skills).filter((n) => !catalog.skills[n].group);
  pages[0].context = { markdown: [
    `Tick the skills to install into \`${catalog.install.skillsDir}\`. They become available in every project after Claude Code restarts.`,
    '',
    '- **Automatic** skills load themselves when a request matches; **invoked** skills run only when you type `/name`.',
    '- Skills that a ticked skill depends on are added for you' + (depOnly.length ? ` (this package can add ${depOnly.map((d) => `\`${d}\``).join(', ')} that way).` : '.'),
    `- An existing skill folder with the same name is backed up to \`${catalog.install.backupDir}/<time>/\` first.`,
    `- The supporting tools (${catalog.tools.join(', ')}) and the shared references some skills read install to \`${catalog.install.toolsDir}\`.`,
  ].join('\n') };
  return {
    id: `${catalog.name}-${catalog.version}`,
    title: `${catalog.title} (${catalog.version})`,
    pages,
    questions: catalog.groups.map((g) => ({
      id: g.id, kind: 'multi', prompt: `${g.title}: which skills?`,
      ...(g.default ? { default: [...g.skills] } : {}),
      options: g.skills.map(option),
    })),
  };
}

// ---------- apply ----------

const hashFile = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const filesUnder = (d) => readdirSync(d).flatMap((e) => { const p = join(d, e); return statSync(p).isDirectory() ? filesUnder(p) : [p]; });

function selectionFromAnswers(catalog, answerPath) {
  let answer;
  try { answer = JSON.parse(readFileSync(answerPath, 'utf8')); } catch (e) { throw new InstallError(`cannot read answers: ${e.message}`, 1); }
  if (answer.status !== 'submitted') throw new InstallError(`the selection page ended as "${answer.status}", not submitted; nothing installed`, 2);
  const groups = new Set(catalog.groups.map((g) => g.id));
  return answer.answers.filter((a) => groups.has(a.id)).flatMap((a) => a.selected.map((s) => s.id));
}

function validateStage(stage, catalog) {
  const validator = join(HERE, 'tools', 'evals', 'validate.mjs');
  if (!existsSync(validator)) return { ran: false, soft: [], warnings: [] };
  const r = spawnSync(process.execPath, [validator, '--skills-dir', stage, '--only-skills'], { encoding: 'utf8' });
  let out;
  try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { throw new InstallError('the validator did not report a result', 2, { stderr: r.stderr.trim().split('\n').slice(-10) }); }
  const expected = new Set(catalog.rewrites.map((rw) => `${rw.skill}/${rw.file}: broken link: ${rw.from.slice(2, -1)}`));
  const soft = [];
  const hard = [];
  for (const e of out.errors ?? []) {
    const where = posix(e.where).split('/installed/').pop();
    const m = e.msg.match(/^(?:suggests|mentions) unknown skill "([^"]+)"/);
    if (m) soft.push({ skill: where.split('/')[0], references: m[1] });
    else if (!expected.has(`${where}: ${e.msg}`)) hard.push(`${where}: ${e.msg}`);
  }
  if (hard.length) throw new InstallError('the selected skills failed validation; nothing installed', 1, { problems: hard });
  return { ran: true, soft, warnings: (out.warnings ?? []).map((w) => `${posix(w.where).split('/installed/').pop()}: ${w.msg}`) };
}

export function apply(catalog, opts) {
  const dest = expand(opts.dest ?? catalog.install.skillsDir);
  const toolsDir = expand(opts.toolsDir ?? catalog.install.toolsDir);
  const backupRoot = expand(opts.backupDir ?? catalog.install.backupDir);
  const chosen = [...new Set(opts.skills)];
  if (!chosen.length) return { status: 'nothing-selected', dest };
  const all = closure(catalog, chosen);
  const added = [...all].filter((n) => !chosen.includes(n)).sort();

  const tmp = mkdtempSync(join(tmpdir(), 'skills-install-'));
  try {
    const stage = join(tmp, 'stage');
    for (const n of all) cpSync(join(HERE, 'skills', n), join(stage, 'installed', n), { recursive: true });
    // Staged skills sit at stage/installed/<name>, so their ../../shared/ links resolve to stage/shared.
    const sharedSrc = join(HERE, 'shared');
    const usesShared = [...all].some((n) => catalog.skills[n].shared?.length);
    if (usesShared) cpSync(sharedSrc, join(stage, 'shared'), { recursive: true });
    log(`validating ${all.size} skill(s)`);
    const check = validateStage(stage, catalog);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const existing = [...all].filter((n) => existsSync(join(dest, n))).sort();
    const plan = {
      dest, toolsDir, installed: [...all].sort(), chosen: chosen.sort(), addedDependencies: added,
      backups: existing.map((n) => ({ skill: n, to: join(backupRoot, timestamp, n) })),
      tools: Object.fromEntries([...catalog.tools, ...(usesShared ? ['shared'] : [])].map((t) => [t, join(toolsDir, t)])),
      validation: check.ran ? 'passed' : 'skipped (no eval toolkit in this package)',
      warnings: check.warnings,
      softReferences: check.soft,
    };
    if (opts.dryRun) return { status: 'dry-run', ...plan };

    for (const t of catalog.tools) {
      rmSync(join(toolsDir, t), { recursive: true, force: true });
      cpSync(join(HERE, 'tools', t), join(toolsDir, t), { recursive: true });
    }
    for (const rw of catalog.rewrites.filter((r) => all.has(r.skill))) {
      const staged = join(stage, 'installed', rw.skill, rw.file);
      const fromFile = posix(relative(dirname(join(dest, rw.skill, rw.file)), toolsDir)) || '.';
      writeFileSync(staged, readFileSync(staged, 'utf8').replaceAll(rw.from, rw.to.replaceAll('{toolsDirFromFile}', fromFile)));
    }
    // Shared references install beside the tools; each link is rewritten to reach them from the installed skill.
    const sharedLinks = [...all].flatMap((n) => (catalog.skills[n].shared ?? []).map((e) => ({ skill: n, ...e })));
    if (usesShared) {
      rmSync(join(toolsDir, 'shared'), { recursive: true, force: true });
      cpSync(sharedSrc, join(toolsDir, 'shared'), { recursive: true });
    }
    for (const e of sharedLinks) {
      const staged = join(stage, 'installed', e.skill, e.file);
      const to = `${posix(relative(dirname(join(dest, e.skill, e.file)), join(toolsDir, 'shared')))}/${e.name}`;
      writeFileSync(staged, readFileSync(staged, 'utf8').replaceAll(`](${e.link}`, `](${to}`));
    }
    mkdirSync(dest, { recursive: true });
    for (const b of plan.backups) {
      mkdirSync(dirname(b.to), { recursive: true });
      try { renameSync(join(dest, b.skill), b.to); } catch { cpSync(join(dest, b.skill), b.to, { recursive: true }); rmSync(join(dest, b.skill), { recursive: true, force: true }); }
    }
    for (const n of all) cpSync(join(stage, 'installed', n), join(dest, n), { recursive: true });

    const mismatches = [];
    for (const n of all) {
      for (const f of filesUnder(join(stage, 'installed', n))) {
        const target = join(dest, n, relative(join(stage, 'installed', n), f));
        if (!existsSync(target) || hashFile(target) !== hashFile(f)) mismatches.push(posix(relative(dest, target)));
      }
    }
    for (const rw of catalog.rewrites.filter((r) => all.has(r.skill))) {
      const file = join(dest, rw.skill, rw.file);
      for (const m of readFileSync(file, 'utf8').matchAll(/\]\(([^)#\s]+)\)/g)) {
        if (m[1].includes('evals/') && !existsSync(resolve(dirname(file), m[1]))) mismatches.push(`${rw.skill}/${rw.file}: link ${m[1]} does not resolve`);
      }
    }
    for (const e of sharedLinks) {
      const file = join(dest, e.skill, e.file);
      for (const m of readFileSync(file, 'utf8').matchAll(/\]\(([^)#\s]+)/g)) {
        if (m[1].endsWith(`/shared/${e.name}`) && !existsSync(resolve(dirname(file), m[1]))) mismatches.push(`${e.skill}/${e.file}: link ${m[1]} does not resolve`);
      }
    }
    if (mismatches.length) throw new InstallError('installed files do not match the package', 1, { problems: mismatches, ...plan });

    const workflows = [...new Set([...all].flatMap((n) => catalog.skills[n].needs?.readiness ?? []))].sort();
    const record = { package: catalog.name, version: catalog.version, builtFrom: catalog.builtFrom, installedAt: new Date().toISOString(), ...plan };
    mkdirSync(toolsDir, { recursive: true });
    const recordPath = join(toolsDir, 'installed.json');
    const history = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')).history ?? [] : [];
    writeFileSync(recordPath, JSON.stringify({ latest: record, history: [...history, { installedAt: record.installedAt, version: record.version, installed: record.installed }] }, null, 2) + '\n');
    return {
      status: 'installed', ...plan, record: recordPath,
      readiness: catalog.tools.includes('readiness') ? `node "${posix(join(toolsDir, 'readiness', 'readiness.mjs'))}"${workflows.length ? ` --for ${workflows.join(',')}` : ''}` : null,
      next: 'Restart Claude Code or start a new session so it loads the new skills.',
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- CLI ----------

function emit(obj, code) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n', () => process.exit(code)); }

function main(argv) {
  if (argv[0] === '--selftest') return selftest();
  const [cmd, ...rest] = argv;
  const argOf = (n) => { const i = rest.indexOf(n); return i > -1 ? rest[i + 1] : undefined; };
  try {
    const catalog = loadCatalog();
    if (cmd === 'list') {
      return emit({ status: 'ok', package: catalog.name, version: catalog.version, groups: catalog.groups.map((g) => ({ id: g.id, title: g.title, default: !!g.default, skills: g.skills })),
        skills: Object.fromEntries(Object.entries(catalog.skills).map(([n, s]) => [n, { group: s.group, mode: s.invoked ? 'invoked' : 'automatic', deps: s.deps, needs: s.needs?.text ?? null, description: s.description }])) }, 0);
    }
    if (cmd === 'page') {
      const out = argOf('--out');
      if (!out) throw new InstallError('page needs --out <spec.json>', 1);
      writeFileSync(resolve(out), JSON.stringify(pageSpec(catalog), null, 2) + '\n');
      return emit({ status: 'ok', spec: resolve(out), consult: posix(join(HERE, 'skills', 'consult', 'scripts', 'consult.mjs')) }, 0);
    }
    if (cmd === 'apply') {
      const answers = argOf('--answers');
      const list = argOf('--skills');
      if (!answers === !list) throw new InstallError('apply needs exactly one of --answers <file> or --skills a,b,c', 1);
      const skills = answers ? selectionFromAnswers(catalog, resolve(answers)) : list.split(',').map((s) => s.trim()).filter(Boolean);
      return emit(apply(catalog, { skills, dryRun: rest.includes('--dry-run'), dest: argOf('--dest'), toolsDir: argOf('--tools-dir'), backupDir: argOf('--backup-dir') }), 0);
    }
    throw new InstallError('usage: node install.mjs list | page --out <spec.json> | apply (--answers <file> | --skills a,b,c) [--dry-run] [--dest <dir>] [--tools-dir <dir>] [--backup-dir <dir>] | --selftest', 1);
  } catch (e) {
    if (e instanceof InstallError) return emit({ status: 'error', error: e.message, ...e.extra }, e.code);
    return emit({ status: 'error', error: String(e?.stack ?? e) }, 2);
  }
}

// ---------- selftest ----------

function selftest() {
  let failed = 0;
  const check = (ok, name) => { if (!ok) { failed++; log(`FAIL ${name}`); } };
  const catalog = loadCatalog();
  const tmp = mkdtempSync(join(tmpdir(), 'skills-install-selftest-'));
  try {
    const opts = { dest: join(tmp, 'claude', 'skills'), toolsDir: join(tmp, 'claude', 'tools'), backupDir: join(tmp, 'claude', 'backup') };

    // The selection page is a valid consult spec with the default groups ticked.
    const specPath = join(tmp, 'page.json');
    const spec = pageSpec(catalog);
    writeFileSync(specPath, JSON.stringify(spec));
    const consult = join(HERE, 'skills', 'consult', 'scripts', 'consult.mjs');
    const c = spawnSync(process.execPath, [consult, 'check', specPath], { encoding: 'utf8' });
    check(c.status === 0, `page is a valid consult spec: ${c.stdout.trim()}`);
    const defaults = catalog.groups.filter((g) => g.default).flatMap((g) => g.skills);
    check(spec.questions.flatMap((q) => q.default ?? []).join() === defaults.join(), 'default groups preselected');

    // Every listed skill installs from the package and passes validation together.
    const everything = catalog.groups.flatMap((g) => g.skills);
    const dry = apply(catalog, { ...opts, skills: everything, dryRun: true });
    check(dry.status === 'dry-run' && dry.validation === 'passed', 'the whole package validates');
    check(!existsSync(opts.dest), 'dry run writes nothing');

    // Dependencies are added and an existing folder is backed up before it is replaced.
    const withDep = Object.keys(catalog.skills).find((n) => catalog.skills[n].group && catalog.skills[n].deps.length);
    mkdirSync(join(opts.dest, withDep), { recursive: true });
    writeFileSync(join(opts.dest, withDep, 'LOCAL-EDIT.md'), 'mine');
    const r = apply(catalog, { ...opts, skills: [withDep] });
    check(r.status === 'installed', `installs ${withDep}`);
    check(catalog.skills[withDep].deps.every((d) => existsSync(join(opts.dest, d, 'SKILL.md'))), 'dependencies installed');
    check(r.backups.length === 1 && existsSync(join(r.backups[0].to, 'LOCAL-EDIT.md')), 'existing folder backed up');
    check(!existsSync(join(opts.dest, withDep, 'LOCAL-EDIT.md')), 'replaced folder holds only package files');
    check(existsSync(join(opts.toolsDir, 'installed.json')), 'install record written');

    // Shared references install with the first skill that links them, and every rewritten link resolves.
    const linker = Object.keys(catalog.skills).find((n) => catalog.skills[n].shared?.length);
    if (linker) {
      apply(catalog, { ...opts, skills: [linker] });
      for (const e of catalog.skills[linker].shared) {
        const file = join(opts.dest, linker, e.file);
        const links = [...readFileSync(file, 'utf8').matchAll(/\]\(([^)#\s]+)/g)].map((m) => m[1]).filter((l) => l.endsWith(`/shared/${e.name}`));
        check(links.length > 0 && links.every((l) => existsSync(resolve(dirname(file), l))), `${linker}/${e.file} reaches shared ${e.name}`);
        check(!readFileSync(file, 'utf8').includes(`](${e.link}`), `${linker}/${e.file} link to ${e.name} rewritten`);
      }
    }

    // Link rewrites resolve to the installed tools.
    for (const rw of catalog.rewrites) {
      apply(catalog, { ...opts, skills: [rw.skill] });
      const text = readFileSync(join(opts.dest, rw.skill, rw.file), 'utf8');
      check(!text.includes(rw.from), `${rw.skill}/${rw.file} rewritten`);
      check(existsSync(join(opts.toolsDir, 'evals', 'README.md')), 'eval toolkit installed');
    }

    // The installed eval toolkit runs from its new home against the installed skills.
    if (catalog.tools.includes('evals')) {
      const nested = join(tmp, 'nested');
      cpSync(opts.dest, join(nested, 'installed'), { recursive: true });
      const v = spawnSync(process.execPath, [join(opts.toolsDir, 'evals', 'validate.mjs'), '--skills-dir', nested, '--only-skills'], { encoding: 'utf8' });
      let out = {};
      try { out = JSON.parse(v.stdout.trim().split('\n').pop()); } catch { /* reported below */ }
      check(typeof out.skills === 'number' && out.skills > 0, 'installed eval toolkit validates installed skills');
    }
    if (catalog.tools.includes('readiness')) {
      const rd = spawnSync(process.execPath, [join(opts.toolsDir, 'readiness', 'readiness.mjs'), '--list'], { encoding: 'utf8' });
      check(rd.status === 0, 'installed readiness checker runs');
    }

    // Refusals.
    const answerFile = join(tmp, 'answer.json');
    writeFileSync(answerFile, JSON.stringify({ status: 'cancelled', answers: [] }));
    let code = 0;
    try { selectionFromAnswers(catalog, answerFile); } catch (e) { code = e.code; }
    check(code === 2, 'unsubmitted answers refused');
    code = 0;
    try { apply(catalog, { ...opts, skills: ['no-such-skill'] }); } catch (e) { code = e.code; }
    check(code === 1, 'unknown skill refused');
    writeFileSync(answerFile, JSON.stringify({ status: 'submitted', answers: [{ id: catalog.groups[0].id, selected: [{ id: catalog.groups[0].skills[0] }] }, { id: 'other', selected: [{ id: 'x' }] }] }));
    check(selectionFromAnswers(catalog, answerFile).join() === catalog.groups[0].skills[0], 'answers map to skills');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  log(failed ? `selftest: ${failed} failure(s)` : 'selftest: ok');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
