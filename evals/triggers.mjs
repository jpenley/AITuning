#!/usr/bin/env node
// Tier 2: trigger and routing checks for model-invoked skills. Free, deterministic, CI-safe.
// A lexical approximation of routing (stemmed TF-IDF over descriptions), adapted from
// addyosmani/agent-skills scripts/run-evals.js (MIT). It can't judge meaning (that's Tier 3),
// but it catches a description missing the words users say, and descriptions that collide.
//
// Usage: node evals/triggers.mjs [--min-rank1 <pct>] [--verbose]
// Exit: 0 pass, 1 failures, 2 could not run. stdout: one JSON object; stderr: report.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadSkills, finish, EVALS_DIR } from './lib/skills.mjs';
import { buildCorpus, rank, heldOut, vec, cosine } from './lib/lexical.mjs';

const COLLISION_WARN = 0.5;
const COLLISION_ERROR = 0.75;
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const minRank1 = (() => {
  const i = args.indexOf('--min-rank1');
  if (i < 0) return null;
  const v = Number(args[i + 1]);
  if (!Number.isFinite(v) || v < 0 || v > 100) {
    console.error('--min-rank1 must be a number from 0 to 100');
    finish({ status: 'error', reason: 'bad --min-rank1' }, 2);
  }
  return v;
})();

// ---------- run ----------

const skills = loadSkills().filter((s) => !s.userOnly && s.name);
if (!skills.length) {
  console.error('triggers: no model-invoked skills found');
  finish({ status: 'error', reason: 'no skills' }, 2);
}
const corpus = buildCorpus(skills);

// --why "<prompt>": show the top five skills for one prompt, to see what a description is losing to.
const whyAt = process.argv.indexOf('--why');
if (whyAt > -1) {
  const top = rank(process.argv[whyAt + 1] ?? '', corpus).slice(0, 5).map((r) => `${r.name}@${r.score.toFixed(3)}`);
  console.error(top.join('  '));
  finish({ status: 'why', top }, 0);
}
const failures = [];
const collisionWarnings = [];
let positives = 0, rank1 = 0;
// A fixed ~40% of positive prompts is held out (by a hash of the prompt text, so it never changes with case
// order). When tuning descriptions, watch the held-out rate: a description tuned on every prompt learns
// those prompts, not the skill. Both rates are reported; the floor applies to the overall rate.
const split = { tuned: { n: 0, rank1: 0 }, heldOut: { n: 0, rank1: 0 } };

for (const s of skills) {
  const file = join(EVALS_DIR, 'cases', `${s.name}.json`);
  if (!existsSync(file)) { failures.push({ skill: s.name, kind: 'missing-cases' }); continue; }
  const c = JSON.parse(readFileSync(file, 'utf8'));

  for (const p of c.trigger?.positive || []) {
    positives++;
    const part = heldOut(p.prompt) ? split.heldOut : split.tuned;
    part.n++;
    const ranking = rank(p.prompt, corpus);
    const idx = ranking.findIndex((r) => r.name === s.name);
    const topK = p.top_k || 3;
    if (idx === 0 && ranking[0].score > 0) { rank1++; part.rank1++; }
    if (idx < 0 || idx >= topK || ranking[idx].score === 0) {
      failures.push({ skill: s.name, kind: 'positive', prompt: p.prompt, rank: idx + 1, topK, top: ranking.slice(0, 3).map((r) => `${r.name}@${r.score.toFixed(2)}`) });
    } else if (verbose) {
      console.error(`  ✓ ${s.name} #${idx + 1}: "${p.prompt}"`);
    }
  }

  for (const n of c.trigger?.negative || []) {
    const ranking = rank(n.prompt, corpus);
    const selfIdx = ranking.findIndex((r) => r.name === s.name);
    if (n.owner) {
      const ownerIdx = ranking.findIndex((r) => r.name === n.owner);
      if (ownerIdx < 0 || ranking[ownerIdx].score === 0 || ownerIdx > selfIdx) {
        failures.push({ skill: s.name, kind: 'negative', prompt: n.prompt, owner: n.owner, ownerRank: ownerIdx + 1, selfRank: selfIdx + 1 });
      }
    } else if (selfIdx === 0 && ranking[0].score > 0) {
      failures.push({ skill: s.name, kind: 'negative', prompt: n.prompt, selfRank: 1 });
    }
  }
}

// Description collisions
const names = skills.map((s) => s.name);
const vectors = names.map((n) => vec(corpus.docs.get(n), corpus.idf));
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const sim = cosine(vectors[i], vectors[j]);
    if (sim >= COLLISION_ERROR) failures.push({ kind: 'collision', pair: [names[i], names[j]], similarity: +sim.toFixed(2) });
    else if (sim >= COLLISION_WARN) collisionWarnings.push({ pair: [names[i], names[j]], similarity: +sim.toFixed(2) });
  }
}

// A run that tested no prompts proves nothing: fail to run rather than pass.
if (!positives) {
  console.error('triggers: no positive prompts found in evals/cases');
  finish({ status: 'error', reason: 'no prompts' }, 2);
}
const rank1Rate = +((rank1 / positives) * 100).toFixed(1);
const pct = (x) => (x.n ? +((x.rank1 / x.n) * 100).toFixed(1) : null);
const splitRates = { tuned: pct(split.tuned), heldOut: pct(split.heldOut), heldOutPrompts: split.heldOut.n };
if (minRank1 !== null && rank1Rate < minRank1) failures.push({ kind: 'rank1-floor', rank1Rate, minRank1 });

// Report
for (const f of failures) {
  if (f.kind === 'positive') console.error(`  ✗ ${f.skill}: ranked #${f.rank || '-'} (needs top ${f.topK}) for "${f.prompt}"  [top: ${f.top.join(', ')}]`);
  else if (f.kind === 'negative') console.error(`  ✗ ${f.skill}: ${f.owner ? `owner ${f.owner} (#${f.ownerRank}) does not outrank it (#${f.selfRank})` : 'ranks first'} for negative "${f.prompt}"`);
  else if (f.kind === 'collision') console.error(`  ✗ collision: ${f.pair.join(' <-> ')} descriptions ${Math.round(f.similarity * 100)}% similar`);
  else if (f.kind === 'rank1-floor') console.error(`  ✗ rank-1 rate ${f.rank1Rate}% is below the floor of ${f.minRank1}%`);
  else console.error(`  ✗ ${f.skill}: ${f.kind}`);
}
for (const w of collisionWarnings) console.error(`  ! near-collision: ${w.pair.join(' <-> ')} ${Math.round(w.similarity * 100)}% similar`);
console.error(`triggers: ${skills.length} skills, ${positives} positive prompts, rank-1 rate ${rank1Rate}% (tuned ${splitRates.tuned}%, held-out ${splitRates.heldOut}% of ${splitRates.heldOutPrompts}), ${failures.length} failure(s)`);
finish({ status: failures.length ? 'failures' : 'pass', skills: skills.length, positives, rank1Rate, splitRates, failures, collisionWarnings }, failures.length ? 1 : 0);
