// Public synthetic demonstration dataset: public-synthetic-v1.
// Generated at export; no recorded runs, real postings, repository diffs or benchmark excerpts.
// Small contract fixtures, not evidence of model quality or continuity with private benchmark results.
import { readData } from '../util.mjs';

export function scoreTop(dataset, rankings) {
  const correct = {};
  let p3 = 0; let r5 = 0;
  for (const it of dataset.items) {
    const r = rankings[it.id] ?? [];
    if (new Set(r).size !== r.length || r.some(id => !it.candidates.some(c => c.id === id))) throw new Error('invalid ranking: duplicate or unknown candidate');
    const hit3 = r.slice(0, 3).filter((x) => it.gold.includes(x)).length;
    const hit5 = r.slice(0, 5).filter((x) => it.gold.includes(x)).length;
    p3 += hit3 / 3;
    r5 += hit5 / Math.min(it.gold.length, 5);
    correct[it.id] = hit3 >= 2;
  }
  const n = dataset.items.length || 1;
  return { primary: p3 / n, primaryName: 'precision@3', metrics: { 'precision@3': p3 / n, 'recall@5': r5 / n, 'twoOfTop3': Object.values(correct).filter(Boolean).length / n }, correct };
}

export default {
  id: 'scout',
  title: 'Fictional job-profile relevance demonstration',
  tool: 'rerank',
  load() {
    const d = readData('scout');
    // One line per candidate: engines that print candidates as "id: text" lines must not see a line without an id.
    return { items: d.cases.map((c) => ({ id: c.id, query: c.query, gold: c.gold, candidates: c.candidates.map((id) => ({ id, text: d.postings[id].replace(/\s*\n\s*/g, ' | ') })) })) };
  },
  async predict(engine, dataset) {
    const preds = {};
    for (const it of dataset.items) {
      const { out } = await engine.call('rerank', { query: it.query, candidates: it.candidates });
      if (!Array.isArray(out?.ranked)) throw new Error(`scout ${it.id}: rerank returned no ranking`);
      preds[it.id] = out.ranked.map((r) => r.id);
    }
    return preds;
  },
  score: scoreTop,
};
