// Public synthetic demonstration dataset: public-synthetic-v1.
// Generated at export; no recorded runs, real postings, repository diffs or benchmark excerpts.
// Small contract fixtures, not evidence of model quality or continuity with private benchmark results.
import { readData, scoreRanked } from '../util.mjs';

// One line per candidate: engines that print candidates as "id: text" lines must not see a body line without an id.
const flat = (s) => s.replace(/\s*\n\s*/g, ' | ');

export default {
  id: 'dig',
  title: 'Synthetic commit-message relevance demonstration',
  tool: 'rerank',
  load() {
    const d = readData('dig');
    return {
      items: d.items.map((it) => ({ id: it.id, query: it.query, gold: it.gold.map((g) => g.slice(0, 10)), candidates: it.candidates.map((c) => ({ id: c, text: flat(d.commits[c]) })) })),
    };
  },
  async predict(engine, dataset) {
    const preds = {};
    for (const it of dataset.items) {
      const { out } = await engine.call('rerank', { query: it.query, candidates: it.candidates });
      if (!Array.isArray(out?.ranked)) throw new Error(`dig ${it.id}: rerank returned no ranking`);
      preds[it.id] = out.ranked.map((r) => r.id);
    }
    return preds;
  },
  score: (dataset, preds) => scoreRanked(dataset, preds, [1, 3]),
};
