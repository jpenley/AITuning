// Shared loader for the skill set: finds skills/<domain>/<skill>/SKILL.md and parses frontmatter.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonSafe } from './terminal.mjs';

export const EVALS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = resolve(EVALS_DIR, '..');
export const SKILLS_DIR = join(ROOT, 'skills');

// The frontmatter at the top of a file: { block } is the whole block with its --- lines, { inner } the lines
// between them. null when the file doesn't open with a closed frontmatter block.
export function frontmatterBlock(src) {
  const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  return m ? { block: m[0], inner: m[1] } : null;
}

export function parseFrontmatter(src) {
  const m = frontmatterBlock(src);
  if (!m) return null;
  const fm = {};
  for (const line of m.inner.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    fm[kv[1]] = v;
  }
  return { fm, body: src.slice(m.block.length) };
}

// Packs are separate plugins: packs/<pack>/.claude-plugin/plugin.json with skills at packs/<pack>/skills/<skill>/.
// The core pack's plugin root is skills/ (skills/.claude-plugin/plugin.json, skills at skills/<domain>/<skill>/), so
// the plugin cache copies only the skills, not the whole repository.
// A standalone set (another skill set sharing the marketplace, such as trajectory/) has the same shape as a pack
// but sits at the top level; STANDALONE_SETS names them.
export const PACKS_DIR = join(ROOT, 'packs');
export const STANDALONE_SETS = ['trajectory', 'knowing'];

export function listPacks(root = ROOT) {
  const core = join(root, 'skills');
  const packs = [{ name: 'core', dir: core, manifest: join(core, '.claude-plugin', 'plugin.json') }];
  const packsDir = join(root, 'packs');
  if (existsSync(packsDir)) {
    for (const p of readdirSync(packsDir).sort()) {
      const dir = join(packsDir, p);
      if (statSync(dir).isDirectory() && existsSync(join(dir, 'skills'))) packs.push({ name: p, dir, manifest: join(dir, '.claude-plugin', 'plugin.json') });
    }
  }
  for (const s of STANDALONE_SETS) {
    const dir = join(root, s);
    if (existsSync(join(dir, 'skills'))) packs.push({ name: s, dir, manifest: join(dir, '.claude-plugin', 'plugin.json'), standalone: true });
  }
  return packs;
}

function readSkill(dir, name, domain, pack) {
  const file = join(dir, 'SKILL.md');
  if (!statSync(dir).isDirectory() || !existsSync(file)) return null;
  const src = readFileSync(file, 'utf8');
  const parsed = parseFrontmatter(src);
  return {
    dirName: name,
    domain,
    pack,
    dir,
    file,
    src,
    parsed,
    name: parsed?.fm.name ?? null,
    description: parsed?.fm.description ?? '',
    userOnly: parsed?.fm['disable-model-invocation'] === 'true',
  };
}

// The core tree (skills/<domain>/<skill>), plus every pack's skills when loading the real repository. withPacks
// also loads the packs and standalone sets beside another core tree (the repository is root's parent).
export function loadSkills(root = SKILLS_DIR, { withPacks = resolve(root) === resolve(SKILLS_DIR) } = {}) {
  const skills = [];
  for (const domain of existsSync(root) ? readdirSync(root) : []) {
    const domainDir = join(root, domain);
    if (!statSync(domainDir).isDirectory()) continue;
    for (const name of readdirSync(domainDir)) {
      const s = readSkill(join(domainDir, name), name, domain, 'core');
      if (s) skills.push(s);
    }
  }
  if (withPacks) {
    for (const p of listPacks(resolve(root, '..')).slice(1)) {
      for (const name of readdirSync(join(p.dir, 'skills'))) {
        const s = readSkill(join(p.dir, 'skills', name), name, p.standalone ? p.name : `packs/${p.name}`, p.name);
        if (s) skills.push(s);
      }
    }
  }
  return skills.sort((a, b) => a.dirName.localeCompare(b.dirName));
}

export { stripFences } from './fences.mjs';

// Emit one JSON result on stdout and exit with the documented code. Characters that could mess with a terminal
// are \u-escaped inside the JSON strings (same values when parsed).
export function finish(result, code) {
  process.stdout.write(jsonSafe(result) + '\n');
  process.exit(code);
}
