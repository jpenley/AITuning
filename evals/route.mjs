#!/usr/bin/env node
// Routing by meaning: the "real-model routing" tier. Each trigger prompt in cases/*.json is classified against the
// descriptions of every model-invoked skill (all packs) by the configured evaluation decision engine, and
// scored like triggers.mjs: positives should pick their skill, negatives their owner.
// The lexical ranking from triggers.mjs is reported beside it, prompt by prompt.
//
// Usage: node route.mjs                       plan: counts and calls, spends nothing
//        node route.mjs --run [--min-rank1 <pct>] [--engine <id[,id...]>] [--config <file>] [--timeout <seconds per call>]
//                             [--only <skill,...>] [--describe <skill>=<file>]...
//        node route.mjs --selftest
// --run sends the skill descriptions and the trigger prompts (repository text, no secrets) to the engine(s): the
// catalog decisionChain (global AGENTS.md for legacy catalogs), or explicit --engine ids tried in order.
// --only classifies just the named skills' prompts (still against every skill), so one question costs one call.
// --describe swaps in a candidate description read from a file, to compare wordings without editing the skill.
// Exit: 0 ran (and met --min-rank1 if given), 1 below --min-rank1, 2 couldn't run (no engine answered, a failed or
// malformed call). stdout: one JSON object; stderr: report. Per-prompt results: results/route-<time>.json.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSkills, finish, EVALS_DIR } from './lib/skills.mjs';
import { buildCorpus, rank } from './lib/lexical.mjs';
import { termSafe } from './lib/terminal.mjs';
import { loadEngineConfig, defaultChain, createEngine, fallbackChain } from './lib/engine.mjs';
import { provenance, sha256 } from './lib/provenance.mjs';
import { PURPOSE, CONTEXT, buildItems, classesFor, batches, onlyItems, withDescriptions } from './lib/route-data.mjs';

const log = (s) => process.stderr.write(termSafe(s) + '\n');

// ---------- scoring ----------

// One result per item from classify: { id, classification, probabilities, margin, confidence, decision }.
export function score(items, results, lexicalRank) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const rows = [];
  for (const it of items) {
    const r = byId.get(it.id);
    if (!r || !r.probabilities) throw new Error(`no classification returned for ${it.id}`);
    const ordered = Object.entries(r.probabilities).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const modelRank = ordered.indexOf(it.want) + 1 || null;
    const lex = lexicalRank(it.text);
    const runnerUp = ordered.find((k) => k !== r.classification);
    const row = { id: it.id, kind: it.kind, want: it.want, heldOut: !!it.heldOut, modelTop: r.classification, modelProb: r.probabilities[r.classification], runnerUp, runnerUpProb: r.probabilities[runnerUp], modelRank, margin: r.margin, decision: r.decision, lexTop: lex[0]?.name, lexRank: lex.findIndex((x) => x.name === it.want) + 1 || null };
    if (it.kind === 'negative') {
      row.pass = (r.probabilities[it.want] ?? 0) > (r.probabilities[it.skill] ?? 0);
      row.lexPass = (lex.findIndex((x) => x.name === it.want) + 1 || 999) < (lex.findIndex((x) => x.name === it.skill) + 1 || 999);
    }
    rows.push(row);
  }
  const pos = rows.filter((r) => r.kind === 'positive');
  const neg = rows.filter((r) => r.kind === 'negative');
  const pct = (xs, f) => (xs.length ? Math.round((1000 * xs.filter(f).length) / xs.length) / 10 : null);
  const summary = {
    positives: pos.length,
    model: { rank1: pct(pos, (r) => r.modelRank === 1), top3: pct(pos, (r) => r.modelRank && r.modelRank <= 3), tuned: pct(pos.filter((r) => !r.heldOut), (r) => r.modelRank === 1), heldOut: pct(pos.filter((r) => r.heldOut), (r) => r.modelRank === 1), negativesPassed: neg.filter((r) => r.pass).length, auto: rows.filter((r) => r.decision === 'auto').length, meanMargin: rows.length ? Math.round((1000 * rows.reduce((s, r) => s + (r.margin ?? 0), 0)) / rows.length) / 1000 : null },
    lexical: { rank1: pct(pos, (r) => r.lexRank === 1), top3: pct(pos, (r) => r.lexRank && r.lexRank <= 3), tuned: pct(pos.filter((r) => !r.heldOut), (r) => r.lexRank === 1), heldOut: pct(pos.filter((r) => r.heldOut), (r) => r.lexRank === 1), negativesPassed: neg.filter((r) => r.lexPass).length },
    negatives: neg.length,
    // Where the two disagree is where one of them is wrong about meaning or wording.
    modelOnlyWrong: pos.filter((r) => r.modelRank !== 1 && r.lexRank === 1).map((r) => r.id),
    lexicalOnlyWrong: pos.filter((r) => r.modelRank === 1 && r.lexRank !== 1).map((r) => r.id),
    bothWrong: pos.filter((r) => r.modelRank !== 1 && r.lexRank !== 1).map((r) => r.id),
  };
  return { rows, summary };
}

export async function classifyAll(items, classes, call) {
  const results = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  for (const batch of batches(items, classes.length)) {
    const out = await call('classify', { purpose: PURPOSE, context: CONTEXT, classes, items: batch.map((it) => ({ id: it.id, text: it.text })) });
    if (!Array.isArray(out?.results)) throw new Error('classify returned no results array');
    const bad = out.results.find((r) => r.error || r.status === 'invalid_response');
    if (bad) throw new Error(`classify: invalid answer for ${bad.id}: ${JSON.stringify(bad).slice(0, 200)}`);
    results.push(...out.results);
    usage.input_tokens += out.usage?.input_tokens ?? 0;
    usage.output_tokens += out.usage?.output_tokens ?? 0;
  }
  return { results, usage };
}

// ---------- selftest ----------

async function selftest() {
  const problems = [];
  const skills = [
    { name: 'tdd', description: 'Use when building a feature test-first.' },
    { name: 'diagnose', description: 'Use when something is broken or slow.' },
    { name: 'audit', description: 'Use when reviewing a branch.' },
  ];
  const cases = [
    { skill_name: 'tdd', trigger: { positive: [{ prompt: 'write the test first for the parser' }, { prompt: 'red green refactor the cart' }], negative: [{ prompt: 'the build broke, debug it', owner: 'diagnose' }] } },
    { skill_name: 'diagnose', trigger: { positive: [{ prompt: 'this endpoint throws since yesterday' }], negative: [] } },
    { skill_name: 'ghost', trigger: { positive: [{ prompt: 'a skill that is not installed' }] } },
  ];
  const items = buildItems(skills, cases);
  if (items.length !== 4 || items.some((i) => i.skill === 'ghost')) problems.push(`buildItems: want 4 items and no uninstalled skill, got ${items.length}`);
  // A fake engine: right for everything except one planted miss, where it ranks audit above tdd.
  const fake = (miss) => async (tool, args) => {
    if (tool !== 'classify' || args.classes.length !== 3 || !/skill/.test(args.purpose)) throw new Error('wrong call shape');
    return { results: args.items.map((it) => {
      const want = items.find((x) => x.id === it.id).want;
      const top = it.id === miss ? 'audit' : want;
      const probabilities = { tdd: 0.05, diagnose: 0.05, audit: 0.05, [top]: 0.8 };
      if (it.id === miss) probabilities[want] = 0.1;
      return { id: it.id, classification: top, probabilities, margin: 0.7, confidence: 0.9, decision: 'auto' };
    }), usage: { input_tokens: 100, output_tokens: 10 } };
  };
  const classes = classesFor(skills);
  const { results, usage } = await classifyAll(items, classes, fake('tdd#p1'));
  const corpus = buildCorpus(skills);
  const { rows, summary } = score(items, results, (t) => rank(t, corpus));
  if (summary.positives !== 3 || summary.model.rank1 !== 66.7) problems.push(`rank-1: want 66.7% of 3 positives, got ${summary.model.rank1}% of ${summary.positives}`);
  if (summary.model.top3 !== 100) problems.push(`top-3: the planted miss ranks 2nd, so top-3 must be 100%, got ${summary.model.top3}`);
  if (summary.negatives !== 1 || summary.model.negativesPassed !== 1) problems.push('negative: the owner (diagnose) must outrank tdd');
  if (!summary.modelOnlyWrong.concat(summary.bothWrong).includes('tdd#p1')) problems.push('the planted miss must be listed as a model miss');
  if (usage.input_tokens !== 100) problems.push('usage must be summed across batches');
  if (batches(new Array(200).fill(0), 26).length !== 4 || batches(new Array(10).fill(0), 250).length !== 1) problems.push('batches: 64 items per call, and items x classes <= 8,000');
  // A failing or malformed call must stop the run, never score as a pass.
  for (const [label, call] of [['tool error', async () => { throw new Error('no provider key'); }], ['no results', async () => ({})], ['invalid answer', async (t, a) => ({ results: a.items.map((i) => ({ id: i.id, status: 'invalid_response' })) })]]) {
    let threw = false;
    try { await classifyAll(items, classes, call); } catch { threw = true; }
    if (!threw) problems.push(`${label} must throw, not return results`);
  }
  let missing = false;
  try { score(items, results.slice(1), (t) => rank(t, corpus)); } catch { missing = true; }
  if (!missing) problems.push('a missing classification must throw');
  if (rows.find((r) => r.id === 'tdd#p1')?.modelRank !== 2) problems.push('modelRank: the planted miss must rank 2');
  // --only keeps one skill's prompts; --describe swaps a description and refuses an unknown skill.
  const only = onlyItems(items, ['diagnose']);
  if (only.length !== 1 || only[0].id !== 'diagnose#p0') problems.push(`--only: want diagnose#p0 alone, got ${only.map((i) => i.id).join(',')}`);
  const swapped = withDescriptions(skills, [['audit', 'Use when X.']]);
  if (swapped.find((s) => s.name === 'audit').description !== 'Use when X.' || skills.find((s) => s.name === 'audit').description === 'Use when X.') problems.push('--describe: must swap the copy, not the original');
  let unknown = false;
  try { withDescriptions(skills, [['ghost', 'x']]); } catch { unknown = true; }
  if (!unknown) problems.push('--describe: an unknown skill must throw');
  log(`route --selftest: ${problems.length} problem(s)${problems.map((p) => `\n  ${p}`).join('')}`);
  finish({ status: problems.length ? 'failures' : 'ok', problems }, problems.length ? 1 : 0);
}

// ---------- main ----------

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1]; };
if (args.includes('--selftest')) await selftest();

const overrides = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--describe') continue;
  const m = /^([^=]+)=(.+)$/.exec(args[i + 1] ?? '');
  if (!m) { log('route: --describe wants <skill>=<file>'); finish({ status: 'error', error: 'bad --describe' }, 2); }
  overrides.push([m[1], readFileSync(m[2], 'utf8').trim()]);
}
let skills;
try { skills = withDescriptions(loadSkills().filter((s) => !s.userOnly && s.name), overrides); } catch (e) { log(`route: ${e.message}`); finish({ status: 'error', error: e.message }, 2); }
const cases = readdirSync(join(EVALS_DIR, 'cases')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(EVALS_DIR, 'cases', f), 'utf8')));
const allItems = buildItems(skills, cases);
const items = opt('--only') ? onlyItems(allItems, opt('--only').split(',')) : allItems;
if (!items.length) { log('route: --only matched no prompts'); finish({ status: 'error', error: 'no prompts' }, 2); }
const classes = classesFor(skills);
const plan = batches(items, classes.length);
if (!args.includes('--run')) {
  log(`route: ${items.length} prompts (${items.filter((i) => i.kind === 'positive').length} positive) against ${classes.length} skills: ${plan.length} classify call(s). Plan only: nothing sent. Add --run to spend.`);
  finish({ status: 'plan', prompts: items.length, skills: classes.length, calls: plan.length }, 0);
}

let engine;
const answered = {};
const receipts = [];
let engineLabel;
let configHash;
const runReceipt = () => provenance(fileURLToPath(import.meta.url), { kind: 'route' }, { items, classes }, { configHash });
try {
  const config = loadEngineConfig(opt('--config') ?? join(EVALS_DIR, 'engines.json'));
  configHash = sha256(config);
  const ids = opt('--engine')?.split(',') ?? defaultChain(config);
  if (!ids?.length) throw new Error('global AGENTS.md has no decision chain and no --engine was given');
  for (const id of ids) if (!config.engines[id]) throw new Error(`engines.json has no engine "${id}"`);
  engine = fallbackChain(ids.map((id) => createEngine(id, config.engines[id], { timeoutMs: Number(opt('--timeout') ?? 180) * 1000 })));
  engineLabel = ids.join('>');
} catch (e) {
  log(`route: couldn't run: ${e.message}`);
  finish({ status: 'error', error: e.message }, 2);
}
// classifyAll wants call(tool, args) -> the tool's answer with its token usage; the chain says who answered.
const call = async (tool, args) => {
  let r;
  try { r = await engine.call(tool, args); }
  catch (e) { receipts.push(e.provenance ?? { error: 'no provenance reported' }); throw e; }
  receipts.push({ ...(r.provenance ?? { error: 'no provenance reported' }), engine: r.engine, fellBackFrom: r.fellBackFrom });
  answered[r.engine] = (answered[r.engine] ?? 0) + 1;
  return { ...r.out, usage: r.usage };
};
let outcome;
try {
  const { results, usage } = await classifyAll(items, classes, call);
  const corpus = buildCorpus(skills);
  outcome = { ...score(items, results, (t) => rank(t, corpus)), usage };
} catch (e) {
  engine.close();
  log(`route: couldn't run: ${e.message}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(join(EVALS_DIR, 'results'), { recursive: true });
  const file = join(EVALS_DIR, 'results', `route-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ stamp, status: 'error', error: e.message, provenance: receipts, runProvenance: runReceipt() }, null, 2) + '\n');
  finish({ status: 'error', error: e.message, file }, 2);
}
engine.close();
const { rows, summary, usage } = outcome;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(join(EVALS_DIR, 'results'), { recursive: true });
const file = join(EVALS_DIR, 'results', `route-${stamp}.json`);
writeFileSync(file, JSON.stringify({ stamp, summary, usage, rows, provenance: receipts, runProvenance: runReceipt() }, null, 2) + '\n');
const j = summary.model;
const l = summary.lexical;
log(`route: ${summary.positives} positive prompts, ${classes.length} skills
  ${engineLabel}: rank-1 ${j.rank1}% (tuned ${j.tuned}%, held-out ${j.heldOut}%), top-3 ${j.top3}%, negatives ${j.negativesPassed}/${summary.negatives}, auto ${j.auto}/${rows.length}, mean margin ${j.meanMargin}
  lexical  rank-1 ${l.rank1}% (tuned ${l.tuned}%, held-out ${l.heldOut}%), top-3 ${l.top3}%, negatives ${l.negativesPassed}/${summary.negatives}
  model wrong, lexical right: ${summary.modelOnlyWrong.length}   lexical wrong, model right: ${summary.lexicalOnlyWrong.length}   both wrong: ${summary.bothWrong.length}`);
for (const r of rows.filter((x) => x.kind === 'positive' && x.modelRank !== 1)) log(`  ✗ ${r.id}: picked ${r.modelTop} (${r.modelProb?.toFixed(2)}), wanted ${r.want} at rank ${r.modelRank}; lexical rank ${r.lexRank}`);
for (const r of rows.filter((x) => x.kind === 'negative' && !x.pass)) log(`  ✗ ${r.id}: owner ${r.want} does not outrank the skill`);
log(`  answered by: ${Object.entries(answered).map(([k, v]) => `${k} ${v} call(s)`).join(', ')}. tokens: ${usage.input_tokens} in, ${usage.output_tokens} out. Per-prompt results: ${file}`);
const min = opt('--min-rank1');
const below = min !== undefined && j.rank1 < Number(min);
finish({ status: below ? 'below-floor' : 'ok', engine: engineLabel, answered, summary, usage, file }, below ? 1 : 0);
