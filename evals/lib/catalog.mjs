// Cross-file consistency of the skill catalogue: the places outside the skills that list them by name (plugin
// descriptions, the README index, the flow map, the landing page) and the copies two plugins keep in step.
// Each check is a pure function over file contents and returns [{ where, msg }], one per finding, so
// validate.mjs runs them on the repository and its --selftest runs them on planted faults.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A skill name as a whole word: not inside a longer name (image-assets doesn't count as "image").
const namesWord = (text, name) => new RegExp(`(?<![A-Za-z0-9-])${escapeRe(name)}(?![A-Za-z0-9-])`).test(text);

// plugins: [{ plugin, skills: [folder names], descriptions: [{ where, text }] }]. Every description names every skill.
export function pluginDescriptions(plugins) {
  const found = [];
  for (const p of plugins) {
    for (const d of p.descriptions) {
      for (const s of p.skills) if (!namesWord(d.text ?? '', s)) found.push({ where: d.where, msg: `description of plugin "${p.plugin}" doesn't name its skill "${s}"` });
    }
  }
  return found;
}

// The first column of the README's index table (the table headed "| Skill |"), one row per skill.
export function indexTableRows(readme) {
  const rows = [];
  let inTable = false;
  for (const line of readme.split(/\r?\n/)) {
    if (/^\|\s*Skill\s*\|/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!line.startsWith('|')) { if (rows.length) break; continue; }
    const cell = line.split('|')[1].trim().replace(/`/g, '');
    if (/^:?-+:?$/.test(cell)) continue;
    rows.push(cell);
  }
  return rows;
}

export function readmeIndex(readme, names, where) {
  const rows = new Set(indexTableRows(readme));
  return names.filter((n) => !rows.has(n)).map((n) => ({ where, msg: `index table has no row for skill "${n}"` }));
}

// The flow map names each skill as `name` or `/name` (bold allowed); `guards-<stack>` and `seams-<stack>` stand
// for the stack packs' skills. The map is the `flow` skill itself, so it needn't name itself.
export const STACK_PLACEHOLDERS = ['guards', 'seams'];
export function flowNames(flow, names, where) {
  const found = [];
  for (const n of names.filter((x) => x !== 'flow')) {
    const stack = STACK_PLACEHOLDERS.find((p) => n.startsWith(`${p}-`));
    const ok = stack ? flow.includes(`\`${stack}-<stack>\``) : flow.includes(`\`${n}\``) || flow.includes(`\`/${n}\``);
    if (!ok) found.push({ where, msg: stack ? `doesn't name \`${stack}-<stack>\` (covers "${n}")` : `doesn't name skill "${n}" as \`${n}\` or \`/${n}\`` });
  }
  return found;
}

// The landing page names each skill inside a <code> element: <code>/name</code>, <code>name</code>, or with
// attributes such as <code data-stack="Rust">name</code>.
export function htmlNames(html, names, where) {
  return names
    .filter((n) => !new RegExp(`<code(?:\\s[^>]*)?>/?${escapeRe(n)}</code>`).test(html))
    .map((n) => ({ where, msg: `doesn't name skill "${n}" in a <code> element` }));
}

// The bullets "- **<label>**:" with their indented continuation lines, keyed by label.
export function labelledBullets(text, labels) {
  const out = {};
  const lines = text.split(/\r?\n/);
  for (const label of labels) {
    const i = lines.findIndex((l) => l.startsWith(`- **${label}**:`));
    if (i === -1) continue;
    const block = [lines[i]];
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) block.push(lines[j]);
    out[label] = block;
  }
  return out;
}

// Two files that must carry the same bullets, line for line (copies two plugins can't share).
export const SHARED_SOURCE_BULLETS = ['X', 'Reddit', 'YouTube'];
export function sharedBullets(a, b, labels = SHARED_SOURCE_BULLETS) {
  const found = [];
  const ba = labelledBullets(a.text, labels);
  const bb = labelledBullets(b.text, labels);
  for (const label of labels) {
    const both = `${a.where} and ${b.where}`;
    if (!ba[label] || !bb[label]) {
      found.push({ where: both, msg: `the "- **${label}**:" bullet is missing from ${!ba[label] ? a.where : b.where}; the two copies must match` });
      continue;
    }
    const n = Math.max(ba[label].length, bb[label].length);
    const line = [...Array(n).keys()].find((k) => ba[label][k] !== bb[label][k]);
    if (line !== undefined) found.push({ where: both, msg: `the "- **${label}**:" bullets differ (line ${line + 1} of the bullet); the two copies must match line for line` });
  }
  return found;
}

// The trigger rank-1 floor has one home, floor.json's trigger-rank1 ratchet (only the owner's approval moves it):
// npm test checks it with floor.mjs, CONSTRAINTS.md's Enforced table points there, and no script pins its own copy.
export function floorRecord(pkg, constraints, floorText) {
  const found = [];
  let rec = null;
  if (floorText === null) found.push({ where: 'floor.json', msg: 'not found; it holds the trigger rank-1 floor' });
  else {
    try { rec = JSON.parse(floorText); } catch (e) { found.push({ where: 'floor.json', msg: `invalid JSON: ${e.message}` }); }
  }
  const r = rec?.ratchets?.['trigger-rank1'];
  if (rec && !(r && r.direction === 'min' && Number.isFinite(r.value))) found.push({ where: 'floor.json', msg: 'no trigger-rank1 ratchet with a numeric minimum' });
  if (!/floor\.mjs check/.test(pkg.scripts?.test ?? '')) found.push({ where: 'evals/package.json scripts.test', msg: "doesn't run floor.mjs check" });
  const enforced = constraints.match(/^## Enforced\b[\s\S]*?(?=^## |(?![\s\S]))/m)?.[0] ?? '';
  if (!/floor\.json/.test(enforced)) found.push({ where: 'CONSTRAINTS.md Enforced table', msg: "doesn't point at floor.json for the rank-1 floor" });
  for (const [where, s] of [['evals/package.json scripts.triggers', pkg.scripts?.triggers], ['evals/package.json scripts.test', pkg.scripts?.test], ['CONSTRAINTS.md Enforced table', enforced]]) {
    if (/--min-rank1\s+\d/.test(s ?? '')) found.push({ where, msg: 'pins a --min-rank1 value; the rank-1 floor lives in floor.json' });
  }
  return found;
}

// Scripts two plugins each need are kept as copies (a plugin can't load another's files); every copy must be
// byte-identical to the first. copies: [{ where, text }] with text null when the file is missing.
export const IDENTICAL_COPIES = [
  ['skills/knowing/skills/understand/scripts/verify-cites.mjs', 'skills/core/engineering/trace/scripts/verify-cites.mjs'],
];
export function identicalCopies(copies) {
  const [first, ...rest] = copies;
  const found = copies.filter((c) => c.text === null).map((c) => ({ where: c.where, msg: `not found; it is a copy of ${copies.find((o) => o !== c)?.where} and must match it byte for byte` }));
  if (first.text === null) return found;
  for (const c of rest) {
    if (c.text === null || c.text === first.text) continue;
    const a = first.text.split('\n'), b = c.text.split('\n');
    const line = [...Array(Math.max(a.length, b.length)).keys()].find((k) => a[k] !== b[k]);
    found.push({ where: `${first.where} and ${c.where}`, msg: `the copies differ (first at line ${line === undefined ? '?' : line + 1}); they must be byte-identical` });
  }
  return found;
}
