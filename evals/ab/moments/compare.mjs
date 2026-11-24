// Public synthetic demonstration dataset: public-synthetic-v1.
// Generated at export; no recorded runs, real postings, repository diffs or benchmark excerpts.
// Small contract fixtures, not evidence of model quality or continuity with private benchmark results.
import { readData, scoreExact } from '../util.mjs';

const RELATIONS = ['same_fact', 'contradicts', 'different_facts'];

export default {
  id: 'compare',
  title: 'Two passages: same fact / contradicts / different facts',
  tool: 'compare',
  load() {
    const d = readData('compare');
    return { items: d.pairs.map((p) => ({ id: p.id, source: p.source, a: p.a, b: p.b, want: p.label })) };
  },
  async predict(engine, dataset) {
    const preds = {};
    for (const it of dataset.items) {
      const { out } = await engine.call('compare', { passage_a: it.a, passage_b: it.b });
      // Jev nests the answer under `overall`; the emulated baselines return it at the top level.
      const rel = out?.overall?.relation ?? out?.relation;
      if (!RELATIONS.includes(rel)) throw new Error(`compare ${it.id}: relation ${JSON.stringify(rel)}`);
      preds[it.id] = rel;
    }
    return preds;
  },
  score(dataset, preds) {
    const s = scoreExact(dataset, preds);
    const per = {};
    for (const l of RELATIONS) {
      const of = dataset.items.filter((it) => it.want === l);
      per[`recall_${l}`] = of.length ? of.filter((it) => preds[it.id] === l).length / of.length : 0;
    }
    return { ...s, metrics: { ...s.metrics, ...per } };
  },
};
