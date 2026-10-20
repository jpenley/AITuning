// The reusable parts of the A/B harness: running one moment on one engine, the decision rule, paired comparison, and moment
// loading. ab.mjs runs them; ab-report.mjs applies the same rule to results already on disk.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EVALS_DIR } from './skills.mjs';
import { metered, median } from './engine.mjs';

export const RULE = { quality: 0.05, speed: 0.5 };

// ---------- running one moment on one engine ----------

export async function runMoment(moment, dataset, engine) {
  if (!dataset.items?.length) throw new Error('cannot run an empty A/B dataset');
  const e = metered(engine);
  let warm = null;
  let warmupProvenance = null;
  try { warmupProvenance = (await e.warmup?.())?.provenance ?? null; }
  catch (err) { warm = String(err.message).slice(0, 200); warmupProvenance = err.provenance ?? null; }
  const t0 = Date.now();
  let preds = {};
  let error = warm ? `warm-up failed: ${warm}` : null;
  if (!warm) {
    try { preds = await moment.predict(e, dataset); } catch (err) { error = String(err.message).slice(0, 300); }
  }
  const scored = moment.score(dataset, preds ?? {});
  const m = e.meter;
  const n = dataset.items.length;
  const overhead = e.overhead;
  const inTok = m.input_tokens;
  const outTok = m.output_tokens;
  // Marginal tokens: what the judgment itself costs, without the harness's own prompt on every call.
  const marginal = overhead ? Math.max(0, inTok - overhead.input_tokens * m.calls) + Math.max(0, outTok - overhead.output_tokens * m.calls) : inTok + outTok;
  return {
    engine: engine.id, error, items: n, answered: Object.keys(preds ?? {}).length,
    provenance: m.provenance, warmupProvenance,
    primary: scored.primary, primaryName: scored.primaryName, metrics: scored.metrics ?? {}, correct: scored.correct ?? {},
    calls: m.calls, callErrors: m.errors, errorSamples: m.errorSamples,
    medianMs: median(m.apiMs.length ? m.apiMs : m.ms), medianWallMs: median(m.ms),
    inputTokens: inTok, outputTokens: outTok, tokens: inTok + outTok, marginalTokens: marginal, tokensPerItem: n ? Math.round((inTok + outTok) / n) : null, marginalPerItem: n ? Math.round(marginal / n) : null,
    costUsd: m.priced && m.calls ? Math.round(m.costUsd * 1e5) / 1e5 : null,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
  };
}

// ---------- the decision ----------

const ratio = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
const round = (x) => (x == null ? null : Math.round(x * 100) / 100);

export function decide(moment, cand, base) {
  if (!cand.items || !base.items || !Number.isFinite(cand.primary) || !Number.isFinite(base.primary)) return { verdict: 'incomplete', why: 'empty or unscored dataset' };
  if (cand.error || cand.answered < cand.items || cand.callErrors) return { verdict: 'incomplete', why: `${cand.engine} did not answer every item${cand.error ? `: ${cand.error}` : ''}` };
  if (base.error || base.answered < base.items || base.callErrors) return { verdict: 'incomplete', why: `baseline ${base.engine} did not answer every item${base.error ? `: ${base.error}` : ''}` };
  const qualityOk = moment.qualityOk ? moment.qualityOk(cand, base, RULE) : cand.primary >= base.primary - RULE.quality;
  const speed = ratio(cand.medianMs, base.medianMs);
  const tokens = ratio(cand.marginalTokens, base.marginalTokens);
  const speedOk = speed != null && speed <= RULE.speed;
  const costOk = tokens != null && tokens <= 1;
  const verdict = qualityOk && speedOk && costOk ? 'adopt' : 'reject';
  const failed = [!qualityOk && 'quality', !speedOk && 'speed', !costOk && 'cost'].filter(Boolean);
  return { verdict, qualityOk, speedRatio: round(speed), tokenRatio: round(tokens), why: verdict === 'adopt' ? 'quality parity, faster, fewer tokens' : `fails ${failed.join(', ')}` };
}

// Items one engine got right and the other wrong, for a paired look at a small sample.
export function paired(a, b) {
  let onlyA = 0;
  let onlyB = 0;
  for (const id of new Set([...Object.keys(a.correct), ...Object.keys(b.correct)])) {
    if (a.correct[id] && !b.correct[id]) onlyA++;
    if (b.correct[id] && !a.correct[id]) onlyB++;
  }
  return { onlyA, onlyB };
}

// ---------- moments ----------

export async function loadMoments(dir = join(EVALS_DIR, 'ab', 'moments')) {
  const out = [];
  let files = [];
  files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
  const expected = ["classify.mjs","compare.mjs","dig.mjs","extract.mjs","gate.mjs","latest.mjs","route.mjs","scout.mjs","screen.mjs","verify.mjs"];
  if (files.join() !== expected.join()) throw new Error('unexpected public moment set');
  for (const f of files) {
    const mod = (await import(pathToFileURL(join(dir, f)).href)).default;
    for (const k of ['id', 'title', 'load', 'predict', 'score']) if (!mod?.[k]) throw new Error(`${f}: a moment needs ${k}`);
    out.push(mod);
  }
  return out;
}
