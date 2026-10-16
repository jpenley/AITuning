// The routing test set, shared by route.mjs (the Jev-only routing tier) and ab/moments/route.mjs (the A/B moment):
// which skill should an agent load for a user's request. Importing this file runs nothing.
import { heldOut } from './lexical.mjs';

export const BATCH = 64; // jev_classify: at most 64 items per call, items x classes <= 8,000
export const PURPOSE = 'Pick the one skill an AI coding agent should load to handle this user request.';
export const CONTEXT = 'Each class is a skill; its description says when to use it. The item is a request a user typed to a coding agent.';

export function buildItems(skills, cases) {
  const names = new Set(skills.map((s) => s.name));
  const items = [];
  for (const c of cases) {
    if (!names.has(c.skill_name)) continue;
    (c.trigger?.positive ?? []).forEach((p, i) => items.push({ id: `${c.skill_name}#p${i}`, text: p.prompt, kind: 'positive', skill: c.skill_name, want: c.skill_name, heldOut: heldOut(p.prompt) }));
    (c.trigger?.negative ?? []).forEach((p, i) => { if (names.has(p.owner)) items.push({ id: `${c.skill_name}#n${i}`, text: p.prompt, kind: 'negative', skill: c.skill_name, want: p.owner }); });
  }
  return items;
}

export const classesFor = (skills) => skills.map((s) => ({ id: s.name, description: s.description }));

// --only: keep the prompts of the named skills' cases; every skill is still a class they're classified against.
export function onlyItems(items, names) {
  const keep = new Set(names);
  return items.filter((it) => keep.has(it.skill));
}

// --describe <skill>=<file>: classify against a candidate description without editing the skill. Unknown skills throw.
export function withDescriptions(skills, overrides) {
  const byName = new Map(overrides);
  for (const name of byName.keys()) if (!skills.some((s) => s.name === name)) throw new Error(`--describe: no model-invoked skill "${name}"`);
  return skills.map((s) => (byName.has(s.name) ? { ...s, description: byName.get(s.name) } : s));
}

// `max` caps the items per call (default: the tool's 64); items x classes stays <= 8,000 either way.
export function batches(items, classCount, max = BATCH) {
  const size = Math.max(1, Math.min(max, Math.floor(8000 / classCount)));
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
