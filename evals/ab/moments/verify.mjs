// Public synthetic demonstration dataset: public-synthetic-v1.
// Generated at export; no recorded runs, real postings, repository diffs or benchmark excerpts.
// Small contract fixtures, not evidence of model quality or continuity with private benchmark results.
import { readData, scoreExact } from '../util.mjs';

const LABELS = ['verified', 'contradicted', 'unsupported'];

export default {
  id: 'verify',
  title: 'Claims vs evidence: verified / contradicted / unsupported',
  tool: 'verify',
  load() {
    const d = readData('verify');
    const items = [];
    for (const doc of d.docs) for (const k of doc.claims) items.push({ id: k.id, doc: doc.id, claim: k.text, want: k.label });
    return { docs: d.docs.map(({ id, kind, text }) => ({ id, kind, text })), items };
  },
  async predict(engine, dataset) {
    const preds = {};
    for (const doc of dataset.docs) {
      const mine = dataset.items.filter((it) => it.doc === doc.id);
      if (!mine.length) continue;
      const { out } = await engine.call('verify', { claims: mine.map((it) => it.claim), evidence: doc.text });
      const rs = out?.results;
      if (!Array.isArray(rs) || rs.length !== mine.length) throw new Error(`verify ${doc.id}: expected ${mine.length} verdicts, got ${Array.isArray(rs) ? rs.length : 'none'}`);
      mine.forEach((it, i) => {
        const v = rs[i]?.verdict;
        if (!LABELS.includes(v)) throw new Error(`verify ${doc.id}: claim ${i} has verdict ${JSON.stringify(v)}`);
        preds[it.id] = v;
      });
    }
    return preds;
  },
  score(dataset, preds) {
    const s = scoreExact(dataset, preds);
    const per = {};
    for (const l of LABELS) {
      const of = dataset.items.filter((it) => it.want === l);
      per[`recall_${l}`] = of.length ? of.filter((it) => preds[it.id] === l).length / of.length : 0;
    }
    return { ...s, metrics: { ...s.metrics, ...per } };
  },
};
