// Public synthetic demonstration dataset: public-synthetic-v1.
// Generated at export; no recorded runs, real postings, repository diffs or benchmark excerpts.
// Small contract fixtures, not evidence of model quality or continuity with private benchmark results.
import { readData, scoreExact } from '../util.mjs';

export default {
  id: 'extract',
  title: 'Extract a value verbatim, or find that it is absent',
  tool: 'extract',
  load() {
    const d = readData('extract');
    const items = [];
    for (const doc of d.docs) for (const f of doc.fields) items.push({ id: `${doc.id}.${f.id}`, doc: doc.id, field: { id: f.id, pattern: f.pattern, ...(f.flags ? { flags: f.flags } : {}), description: f.description }, want: f.want });
    return { docs: d.docs.map(({ id, kind, text }) => ({ id, kind, text })), items };
  },
  async predict(engine, dataset) {
    const preds = {};
    for (const doc of dataset.docs) {
      const mine = dataset.items.filter((it) => it.doc === doc.id);
      if (!mine.length) continue;
      const { out } = await engine.call('extract', { document: doc.text, fields: mine.map((it) => it.field) });
      const rs = out?.results;
      if (!Array.isArray(rs) || rs.length !== mine.length) throw new Error(`extract ${doc.id}: expected ${mine.length} results, got ${Array.isArray(rs) ? rs.length : 'none'}`);
      mine.forEach((it, i) => {
        const r = rs[i];
        // Current engine contract: auto selects a string, not_found is explicit null,
        // and review may select either. Unknown/missing fields are failed calls, never absent answers.
        if (!r || !['auto', 'review', 'not_found'].includes(r.status) ||
          !(typeof r.value === 'string' || r.value === null) ||
          r.status === 'auto' && typeof r.value !== 'string' ||
          r.status === 'not_found' && r.value !== null) throw new Error(`extract ${doc.id}.${it.field.id}: invalid status/value contract`);
        preds[it.id] = r.value;
      });
    }
    return preds;
  },
  score(dataset, preds) {
    const s = scoreExact(dataset, preds);
    const absent = dataset.items.filter((it) => it.want === null);
    const present = dataset.items.filter((it) => it.want !== null);
    const rate = (xs) => (xs.length ? xs.filter((it) => s.correct[it.id]).length / xs.length : 0);
    return { ...s, metrics: { ...s.metrics, presentAccuracy: rate(present), absentAccuracy: rate(absent), absentTotal: absent.length } };
  },
};
