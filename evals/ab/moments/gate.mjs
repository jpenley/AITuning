// Public synthetic demonstration dataset: public-synthetic-v1.
// Generated at export; no recorded runs, real postings, repository diffs or benchmark excerpts.
// Small contract fixtures, not evidence of model quality or continuity with private benchmark results.
import { readData, scoreExact } from '../util.mjs';

const LABELS = ['verified', 'contradicted', 'unsupported'];

export default {
  id: 'gate',
  title: 'Completion gate: claims about a change vs its diff and test log',
  tool: 'gate',
  load() {
    const d = readData('gate');
    const items = [];
    for (const c of d.cases) for (const k of c.claims) items.push({ id: k.id, case: c.id, claim: k.text, want: k.label });
    return { cases: d.cases, items };
  },
  async predict(engine, dataset) {
    const preds = {};
    for (const c of dataset.cases) {
      const mine = dataset.items.filter((it) => it.case === c.id);
      if (!mine.length) continue;
      const { out } = await engine.call('gate', {
        request: c.request,
        diff: c.diff,
        claims: mine.map((it) => it.claim),
        evidence: [{ id: 'diff', text: c.diff }, { id: 'test-log', text: c.tests }],
        tests: c.tests,
      });
      // The contract says "per-claim verdicts"; the engines nest them differently (Jev: verification.results, the
      // emulated baselines: claims), so accept either. A missing or unknown verdict is a failed call, never a guess.
      const rs = out?.verification?.results ?? out?.claims;
      if (!Array.isArray(rs) || rs.length !== mine.length) throw new Error(`gate ${c.id}: expected ${mine.length} claim verdicts, got ${Array.isArray(rs) ? rs.length : 'none'}`);
      mine.forEach((it, i) => {
        const v = rs[i]?.verdict;
        if (!LABELS.includes(v)) throw new Error(`gate ${c.id}: claim ${i} has verdict ${JSON.stringify(v)}`);
        preds[it.id] = v;
      });
    }
    return preds;
  },
  score(dataset, preds) {
    const s = scoreExact(dataset, preds);
    const bad = dataset.items.filter((it) => it.want === 'contradicted');
    const caught = bad.filter((it) => preds[it.id] === 'contradicted').length;
    const passed = bad.filter((it) => preds[it.id] === 'verified').length;
    return {
      ...s,
      metrics: { ...s.metrics, contradictedRecall: bad.length ? caught / bad.length : 0, contradictedCaught: caught, contradictedTotal: bad.length, contradictedPassedAsVerified: passed },
    };
  },
  // A contradicted claim must never pass, so recall on those is judged as strictly as the overall accuracy.
  qualityOk(cand, base, RULE) {
    const recall = (r) => r.metrics?.contradictedRecall ?? 0;
    return cand.primary >= base.primary - RULE.quality && recall(cand) >= recall(base) - 0.05;
  },
};
