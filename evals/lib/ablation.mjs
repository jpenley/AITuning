// Selective controls retain the complete neighboring skill directories in both arms.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

function digest(dir) {
  const hash = createHash('sha256');
  function walk(at) {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        const bytes = readFileSync(path);
        hash.update(relative(dir, path).replaceAll('\\', '/') + '\0' + bytes.length + '\0').update(bytes);
      }
    }
  }
  walk(dir);
  return hash.digest('hex');
}

export function inventory(skills, removed) {
  const full = skills.map(s => ({ name: s.name, pack: s.pack, sha256: digest(s.dir) })).sort((a, b) => a.name.localeCompare(b.name));
  const arms = { with: full, without: full.filter(s => !removed.includes(s.name)) };
  return { kind: 'skill-ablation', removed, arms, sha256: createHash('sha256').update(JSON.stringify({ removed, arms })).digest('hex') };
}

export function validateCatalog(skills, packs) {
  const names = new Set();
  for (const skill of skills) {
    if (!skill.name || names.has(skill.name)) throw new Error(`ablation needs unique skill names: ${skill.name}`);
    names.add(skill.name);
    const pack = packs.find(p => p.name === skill.pack);
    if (!pack || !existsSync(pack.manifest)) throw new Error(`ablation: missing manifest for ${skill.pack}/${skill.name}`);
    const manifest = JSON.parse(readFileSync(pack.manifest, 'utf8'));
    const path = './' + relative(pack.dir, skill.dir).replaceAll('\\', '/');
    if (!Array.isArray(manifest.skills) || !manifest.skills.includes(path)) throw new Error(`ablation: plugin manifest omits ${skill.name}: ${pack.manifest}`);
  }
}

export function materializeAblation(root, skills, packs, removed) {
  validateCatalog(skills, packs);
  // Copy once before splitting arms so an edit to live source cannot change just one arm.
  const snapshots = skills.map(s => {
    const dir = join(root, 'ablation-source', s.name);
    cpSync(s.dir, dir, { recursive: true });
    return { ...s, dir };
  });
  const experiment = inventory(snapshots, removed);
  const pluginDirs = {};
  const armSkills = {};
  for (const arm of ['with', 'without']) {
    const selected = snapshots.filter(s => arm === 'with' || !removed.includes(s.name));
    armSkills[arm] = [];
    pluginDirs[arm] = [];
    for (const pack of packs) {
      const members = selected.filter(s => s.pack === pack.name);
      if (!members.length) continue;
      const sourceManifest = JSON.parse(readFileSync(pack.manifest, 'utf8'));
      const dir = join(root, `ablation-${arm}`, pack.name);
      mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
      const paths = [];
      for (const s of members) {
        const original = skills.find(candidate => candidate.name === s.name);
        const path = './' + relative(pack.dir, original.dir).replaceAll('\\', '/');
        if (!sourceManifest.skills.includes(path)) throw new Error(`plugin manifest omits ${s.name}: ${pack.manifest}`);
        const dst = join(dir, path);
        cpSync(s.dir, dst, { recursive: true });
        paths.push(path);
        armSkills[arm].push({ ...s, dir: dst });
      }
      // Only skill capabilities are under test; neither arm imports plugin hooks or MCP config.
      const manifest = { name: sourceManifest.name, version: sourceManifest.version, description: sourceManifest.description, skills: paths };
      writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
      pluginDirs[arm].push(dir);
    }
  }
  return { experiment, pluginDirs, armSkills };
}
