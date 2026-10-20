#!/usr/bin/env node
// A/B tests for the quick judgments the skills make: is a cheap, fast judgment engine (Jev today) as good as the full
// model at each "moment", and is it faster and cheaper? Each moment in ab/moments/<id>.mjs owns a labelled dataset and
// a way to ask an engine (lib/engine.mjs); this file runs every moment against every engine, scores them, and applies
// a decision rule that was fixed before any data was seen:
//
//   Jev-class engine wins a moment against a baseline when ALL hold:
//     1. quality: the moment's quality check passes (default: primary metric >= baseline - 0.05)
//     2. speed:   median call latency <= 0.5x the baseline's (the baseline's model API time, not CLI start-up)
//     3. cost:    tokens per item <= the baseline's marginal tokens per item (its harness overhead subtracted)
//   Dollars are shown wherever both engines report them; they don't decide.
//
// Usage: node ab.mjs                                   plan: moments, items, calls; spends nothing
//        node ab.mjs --run [--moments a,b] [--engines jev,haiku,sonnet] [--limit <n items>] [--timeout <seconds>] [--config <file>]
//        node ab.mjs --selftest
// The first engine named (default: the catalog's decision chain) is the candidate; "baseline" in engines.json is the
// full model it must beat on speed and cost; every other engine is shown too. Exit: 0 ran, 2 couldn't run.
// stdout: one JSON object; stderr: report. Per-moment detail: results/ab-<time>.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finish, EVALS_DIR } from './lib/skills.mjs';
import { termSafe } from './lib/terminal.mjs';
import { loadEngineConfig, defaultChain, createEngine, fallbackChain } from './lib/engine.mjs';
import { RULE, runMoment, decide, paired, loadMoments } from './lib/ab-core.mjs';
import { emulate, parseJson } from './lib/emulate.mjs';
import { provenance, sha256 } from './lib/provenance.mjs';

const log = (s) => process.stderr.write(termSafe(s) + '\n');
// ---------- selftest ----------

async function selftest() {
  const problems = [];
  const fake = (id, { errorsOn, ms = 10, tokens = 100, answer }) => ({
    id, kind: 'fake',
    async call(tool, args) {
      if (errorsOn?.(tool, args)) throw new Error(`${id} boom`);
      return { out: answer(tool, args), usage: { input_tokens: tokens, output_tokens: 0 }, ms, apiMs: null, costUsd: null };
    },
    close() {},
  });
  const moment = {
    id: 'fake', title: 'Fake', tool: 'screen',
    load: () => ({ items: [{ id: 'a', want: 1 }, { id: 'b', want: 0 }, { id: 'c', want: 1 }, { id: 'd', want: 0 }] }),
    async predict(engine, ds) { const p = {}; for (const it of ds.items) p[it.id] = (await engine.call('screen', { text: it.id })).out.v; return p; },
    score(ds, preds) { const correct = Object.fromEntries(ds.items.filter((i) => i.id in preds).map((i) => [i.id, preds[i.id] === i.want])); const n = Object.values(correct).filter(Boolean).length; return { primary: n / ds.items.length, primaryName: 'accuracy', correct }; },
  };
  const ds = moment.load();
  const truth = { a: 1, b: 0, c: 1, d: 0 };
  const right = (_t, a) => ({ v: truth[a.text] });
  const wrong = (_t, a) => ({ v: 1 - truth[a.text] });
  const run = (e) => runMoment(moment, ds, e);

  const base = await run(fake('base', { ms: 1000, tokens: 1000, answer: right }));
  const good = await run(fake('good', { ms: 100, tokens: 100, answer: right }));
  const bad = await run(fake('bad', { ms: 100, tokens: 100, answer: wrong }));
  const slow = await run(fake('slow', { ms: 900, tokens: 100, answer: right }));
  const dear = await run(fake('dear', { ms: 100, tokens: 2000, answer: right }));
  const broken = await run(fake('broken', { errorsOn: (_t, a) => a.text === 'c', answer: right }));
  if (base.primary !== 1 || bad.primary !== 0) problems.push(`scoring: want base 1 and bad 0, got ${base.primary} and ${bad.primary}`);
  if (decide(moment, good, base).verdict !== 'adopt') problems.push(`decide: a right, fast, cheap engine must be adopted: ${JSON.stringify(decide(moment, good, base))}`);
  if (decide(moment, bad, base).verdict !== 'reject' || !decide(moment, bad, base).why.includes('quality')) problems.push('decide: a wrong engine must fail on quality');
  if (!decide(moment, slow, base).why.includes('speed')) problems.push('decide: an engine at 0.9x the latency must fail on speed');
  if (!decide(moment, dear, base).why.includes('cost')) problems.push('decide: an engine that uses 2x the tokens must fail on cost');
  if (decide(moment, broken, base).verdict !== 'incomplete') problems.push('decide: an engine that threw on an item must be incomplete, never adopted');
  if (broken.answered === broken.items) problems.push('runMoment: a throwing engine must leave items unanswered');
  const p = paired(good, bad);
  if (p.onlyA !== 4 || p.onlyB !== 0) problems.push(`paired: want 4/0, got ${p.onlyA}/${p.onlyB}`);
  const noWarm = await runMoment(moment, ds, { ...fake('nowarm', { answer: right }), warmup: async () => { throw new Error('no server'); } });
  if (!noWarm.error || decide(moment, noWarm, base).verdict !== 'incomplete') problems.push('runMoment: a failed warm-up must be reported and never adopted');

  // fallbackChain: the next engine answers after an error or an invalid_response; a review answer is an answer; all failing throws.
  const flaky = fake('flaky', { errorsOn: () => true, answer: right });
  const invalid = { id: 'inv', async call() { throw Object.assign(new Error('inv: invalid_response'), { invalid: true }); }, close() {} };
  const fine = fake('fine', { answer: (_t, a) => ({ v: truth[a.text], recommendation: { action: 'review' } }) });
  const r1 = await fallbackChain([flaky, invalid, fine]).call('screen', { text: 'a' });
  if (r1.engine !== 'fine' || r1.fellBackFrom.length !== 2) problems.push(`fallbackChain: want fine after 2 failures, got ${r1.engine} after ${r1.fellBackFrom?.length}`);
  const r2 = await fallbackChain([fine, flaky]).call('screen', { text: 'a' });
  if (r2.engine !== 'fine' || r2.fellBackFrom.length !== 0 || r2.out.recommendation.action !== 'review') problems.push('fallbackChain: a review answer must be returned, not retried on another engine');
  let threw = false;
  try { await fallbackChain([flaky, invalid]).call('screen', { text: 'a' }); } catch (e) { threw = /every engine failed/.test(e.message); }
  if (!threw) problems.push('fallbackChain: when every engine fails it must throw, never pass');

  // emulate: a model answering the contracts returns Jev's real shapes (checked against live jev_* output), so a skill
  // reads the same fields from any engine. The fake model answers each prompt kind with fixed JSON.
  const scripted = async (prompt) => {
    const t = prompt.includes('Judge how the two passages') ? { same_fact: 0.05, contradicts: 0.9, different_facts: 0.05, aspects: { month: { same_fact: 0, contradicts: 1, different_facts: 0 } } }
      : prompt.includes('regex matches listed') ? { fields: { price: { 0: 0.9, 1: 0.05, none: 0.05 } } }
      : prompt.includes('For each claim') ? { results: [{ id: 'claim0', supports: 0.05, contradicts: 0.9, says_nothing: 0.05 }] }
      : prompt.includes('Score a proposed change') ? { correctness: 2, spec_match: 2, test_gap: 2, blast_radius: 2 }
      : {};
    return { text: JSON.stringify(t), usage: { input_tokens: 10, output_tokens: 5 } };
  };
  const shape = async (tool, a) => (await emulate(tool, a, scripted)).out;
  const cmp = await shape('compare', { passage_a: 'x', passage_b: 'y', aspects: ['month'] });
  if (cmp.overall?.relation !== 'contradicts' || cmp.aspects?.[0]?.aspect !== 'month' || cmp.aspects[0].relation !== 'contradicts') problems.push(`emulate compare: want overall.relation and aspects[].aspect like Jev, got ${JSON.stringify(cmp).slice(0, 200)}`);
  const gt = await shape('gate', { request: 'r', diff: 'd', claims: ['c'], evidence: [{ id: 'e', text: 't' }] });
  if (gt.action !== 'escalate' || gt.verification?.results?.[0]?.verdict !== 'contradicted' || typeof gt.review?.scores?.correctness?.score !== 'number') problems.push(`emulate gate: want action, review.scores.*.score and verification.results like Jev, got ${JSON.stringify(gt).slice(0, 200)}`);
  const ex = await shape('extract', { document: 'Price: $20 per month. Was $30.', fields: [{ id: 'price', pattern: '\\$\\d+', description: 'price' }, { id: 'zip', pattern: '\\d{5}', description: 'zip' }] });
  if (ex.results[0].value !== '$20' || ex.results[1].status !== 'not_found' || ex.results[1].reason !== 'no_regex_matches') problems.push(`emulate extract: want a verbatim match, and no_regex_matches for a field with no match, got ${JSON.stringify(ex).slice(0, 200)}`);

  // parseJson: the first balanced object wins, even with trailing prose, a second object, or braces inside strings.
  const pj = (s) => JSON.stringify(parseJson(s));
  if (pj('Here: {"a":{"b":"}"}} and {"c":1}') !== '{"a":{"b":"}"}}' || pj('{"a":1}\n\nNote: {see above}') !== '{"a":1}') problems.push('parseJson: must take the first balanced object');
  let unterminated = false;
  try { parseJson('{"a": 1'); } catch { unterminated = true; }
  if (!unterminated) problems.push('parseJson: an unterminated object must throw');

  // A malformed reply is asked for once more and its tokens still count; two in a row fail the call.
  let malformedAsks = 0;
  const badOnce = async () => ({ text: ++malformedAsks === 1 ? '{"injection": 0.9,' : '{"injection":0.9,"substance":0.5}', usage: { input_tokens: 3, output_tokens: 2 } });
  const rs = await emulate('screen', { text: 'x' }, badOnce);
  if (malformedAsks !== 2 || rs.usage.input_tokens !== 6 || rs.out.probabilities.injection !== 0.9) problems.push(`emulate: a malformed reply must be re-asked once with both asks counted (asks ${malformedAsks}, tokens ${rs.usage.input_tokens})`);
  let bothBad = false;
  try { await emulate('screen', { text: 'x' }, async () => ({ text: 'not json', usage: { input_tokens: 1, output_tokens: 1 } })); } catch { bothBad = true; }
  if (!bothBad) problems.push('emulate: two malformed replies in a row must fail the call');

  // A model that skips a candidate is asked once more for just that one; one that keeps skipping fails the call.
  let asks = 0;
  const skipsOnce = async (prompt) => {
    asks++;
    const ids = [...prompt.matchAll(/^(c\d): /gm)].map((m) => m[1]).filter((id) => asks > 1 || id !== 'c1');
    return { text: JSON.stringify({ scores: ids.map((id) => ({ id, relevance: id === 'c2' ? 0.9 : 0.1 })) }), usage: { input_tokens: 1, output_tokens: 1 } };
  };
  const cands = [{ id: 'c0', text: 'a' }, { id: 'c1', text: 'b\nmore' }, { id: 'c2', text: 'c' }];
  const rr = (await emulate('rerank', { query: 'q', candidates: cands }, skipsOnce)).out;
  if (asks !== 2 || rr.ranked.length !== 3 || rr.ranked[0].id !== 'c2') problems.push(`emulate rerank: a skipped candidate must be re-asked once (asks ${asks}), got ${JSON.stringify(rr.ranked.map((r) => r.id))}`);
  let failed = false;
  try { await emulate('rerank', { query: 'q', candidates: cands }, async () => ({ text: JSON.stringify({ scores: [{ id: 'c0', relevance: 0.5 }] }), usage: { input_tokens: 1, output_tokens: 1 } })); } catch (e) { failed = /no score for c1/.test(e.message); }
  if (!failed) problems.push('emulate rerank: a candidate that stays unscored after the retry must fail the call');

  log(`ab --selftest: ${problems.length} problem(s)`);
  for (const x of problems) log(`  ✗ ${x}`);
  finish({ status: problems.length ? 'fail' : 'ok', problems }, problems.length ? 1 : 0);
}

// ---------- main ----------

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1]; };
if (args.includes('--selftest')) await selftest();

const config = loadEngineConfig(opt('--config') ?? join(EVALS_DIR, 'engines.json'));
const want = opt('--moments')?.split(',');
const moments = (await loadMoments()).filter((m) => !want || want.includes(m.id));
if (want) for (const w of want) if (!moments.some((m) => m.id === w)) { log(`ab: no moment "${w}"`); finish({ status: 'error', error: `no moment ${w}` }, 2); }
const limit = opt('--limit') ? Number(opt('--limit')) : Infinity;
const datasets = new Map();
for (const m of moments) {
  const ds = await m.load();
  datasets.set(m.id, { ...ds, items: ds.items.slice(0, limit) });
}
const engineIds = (opt('--engines')?.split(',') ?? [...(defaultChain(config) ?? []).slice(0, 1), config.baseline, ...Object.keys(config.engines).filter((k) => !config.engines[k].optIn)]).filter((v, i, a) => v && a.indexOf(v) === i);
for (const id of engineIds) if (!config.engines[id]) { log(`ab: engines.json has no engine "${id}"`); finish({ status: 'error', error: `no engine ${id}` }, 2); }

if (!args.includes('--run')) {
  log(`ab: ${moments.length} moment(s), engines ${engineIds.join(', ')}. Plan only: nothing sent. Add --run to spend.`);
  for (const m of moments) log(`  ${m.id}: ${datasets.get(m.id).items.length} items - ${m.title}`);
  finish({ status: 'plan', moments: moments.map((m) => ({ id: m.id, items: datasets.get(m.id).items.length })), engines: engineIds }, 0);
}

if (!moments.length || [...datasets.values()].some(ds => !ds.items.length) || !engineIds.length || !engineIds.includes(config.baseline)) finish({ status: 'error', error: 'live A/B needs nonempty moments/items and candidate/baseline engines' }, 2);
for (const id of engineIds) if (config.engines[id]?.enabled !== true) finish({ status: 'error', error: 'engine ' + id + ' disabled' }, 2);
if (engineIds[0] === config.baseline) finish({ status: 'error', error: 'live A/B needs distinct candidate and baseline engines' }, 2);
const candidateId = engineIds[0];
const baselineId = config.baseline;
const timeoutMs = Number(opt('--timeout') ?? 180) * 1000;
const all = [];
for (const m of moments) {
  const ds = datasets.get(m.id);
  const rows = [];
  for (const id of engineIds) {
    const engine = createEngine(id, config.engines[id], { timeoutMs });
    log(`ab: ${m.id} on ${id} (${ds.items.length} items)...`);
    rows.push(await runMoment(m, ds, engine));
    engine.close();
    const r = rows.at(-1);
    log(`  ${id}: ${r.primaryName} ${r.primary == null ? 'n/a' : r.primary.toFixed(3)}, ${r.answered}/${r.items} answered${r.callErrors ? `, ${r.callErrors} call error(s): ${r.errorSamples[0]}` : ''}, median ${r.medianMs ?? 'n/a'} ms, ${r.marginalPerItem} marginal tokens/item, $${r.costUsd ?? 'n/a'}`);
  }
  const cand = rows.find((r) => r.engine === candidateId);
  const decisions = {};
  for (const r of rows) if (r.engine !== candidateId) decisions[r.engine] = { ...decide(m, cand, r), ...paired(cand, r) };
  all.push({ moment: m.id, title: m.title, candidate: candidateId, baseline: baselineId, rows, decisions, decision: decisions[baselineId] ?? null });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(join(EVALS_DIR, 'results'), { recursive: true });
const file = join(EVALS_DIR, 'results', `ab-${stamp}.json`);
writeFileSync(file, JSON.stringify({ stamp, rule: RULE, candidate: candidateId, baseline: baselineId, results: all,
  runProvenance: provenance(fileURLToPath(import.meta.url), { kind: 'ab' }, [...datasets], { configHash: sha256(config) }) }, null, 2) + '\n');
log(`\nab: candidate ${candidateId} against baseline ${baselineId} (rule: quality within ${RULE.quality}, latency <= ${RULE.speed}x, tokens <= 1x marginal)`);
for (const a of all) {
  const d = a.decision;
  log(`  ${a.moment.padEnd(10)} ${d ? d.verdict.toUpperCase().padEnd(10) : 'n/a'.padEnd(10)} ${d ? d.why : 'baseline not run'}${d?.speedRatio != null ? ` (latency ${d.speedRatio}x, tokens ${d.tokenRatio}x, only-cand ${d.onlyA}, only-base ${d.onlyB})` : ''}`);
}
log(`  per-item detail: ${file}`);
finish({ status: 'ok', file, decisions: all.map((a) => ({ moment: a.moment, verdict: a.decision?.verdict ?? null, why: a.decision?.why ?? null })) }, 0);
