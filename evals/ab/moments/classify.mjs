// Public synthetic demonstration dataset: public-synthetic-v1.
// Generated at export; no recorded runs, real postings, repository diffs or benchmark excerpts.
// Small contract fixtures, not evidence of model quality or continuity with private benchmark results.
import { readData, scoreExact } from '../util.mjs';

const CALL_ITEMS = 30; // the baseline chunks at 30 items per model call; Jev takes up to 64

export default {
  id: 'classify',
  title: 'Sort old plan items into spec, ticket, standalone, duplicate, skip (adopt)',
  tool: 'classify',

  load() {
    const { items, classes, purpose, context } = readData('classify');
    return { items, classes, purpose, context };
  },

  async predict(engine, dataset) {
    const preds = {};
    for (let i = 0; i < dataset.items.length; i += CALL_ITEMS) {
      const batch = dataset.items.slice(i, i + CALL_ITEMS);
      const { out } = await engine.call('classify', { purpose: dataset.purpose, context: dataset.context, classes: dataset.classes, items: batch.map((it) => ({ id: it.id, text: it.text })) });
      if (!Array.isArray(out?.results)) throw new Error('classify returned no results array');
      for (const r of out.results) if (r.classification) preds[r.id] = r.classification;
    }
    return preds;
  },

  score(dataset, preds) {
    const s = scoreExact(dataset, preds);
    const perClass = {};
    for (const c of dataset.classes) {
      const of = dataset.items.filter((it) => it.want === c.id);
      perClass[c.id] = of.length ? of.filter((it) => s.correct[it.id]).length / of.length : null;
    }
    return { ...s, metrics: { ...s.metrics, perClass } };
  },
};
