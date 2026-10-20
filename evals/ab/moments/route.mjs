// Moment "route": which skill should the agent load for a user's request? Every model-invoked skill is a class (its
// description is the class description); each trigger prompt in evals/cases/*.json is an item.
//
// Labels: a positive prompt's label is the skill whose case file lists it (by construction, the case author wrote the
// prompt to trigger that skill). Negative prompts (which have an "owner" skill and whose route.mjs score is a rank
// comparison, not a label) are dropped, so the score is exact-match accuracy over positives only.
//
// The dataset is built from the repository at run time (loadSkills + cases), so it is deterministic for a given git
// state but moves when a skill description or a case file changes. Compare runs made at the same commit only.
// Caveat: the descriptions were tuned against the lexical ranker for these same prompts; `heldOut` marks the 40% of
// prompts that hash-select as never used for that tuning, and its accuracy is reported as a metric.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSkills, EVALS_DIR } from '../../lib/skills.mjs';
import { PURPOSE, CONTEXT, buildItems, classesFor, batches } from '../../lib/route-data.mjs';
import { scoreExact } from '../util.mjs';

const CALL_ITEMS = 30; // the baseline chunks at 30 items per model call; Jev takes up to 64

export default {
  id: 'route',
  title: 'Route a user request to the skill to load (every model-invoked skill is a class)',
  tool: 'classify',

  load() {
    const skills = loadSkills().filter((s) => !s.userOnly && s.name);
    const cases = readdirSync(join(EVALS_DIR, 'cases')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(EVALS_DIR, 'cases', f), 'utf8')));
    const items = buildItems(skills, cases).filter((i) => i.kind === 'positive');
    return { items, classes: classesFor(skills) };
  },

  async predict(engine, dataset) {
    const preds = {};
    for (const batch of batches(dataset.items, dataset.classes.length, CALL_ITEMS)) {
      const { out } = await engine.call('classify', { purpose: PURPOSE, context: CONTEXT, classes: dataset.classes, items: batch.map((it) => ({ id: it.id, text: it.text })) });
      if (!Array.isArray(out?.results)) throw new Error('classify returned no results array');
      for (const r of out.results) if (r.classification) preds[r.id] = r.classification;
    }
    return preds;
  },

  score(dataset, preds) {
    const s = scoreExact(dataset, preds);
    const held = dataset.items.filter((i) => i.heldOut);
    const heldRight = held.filter((i) => s.correct[i.id]).length;
    return { ...s, metrics: { ...s.metrics, heldOut: held.length ? heldRight / held.length : null, heldOutItems: held.length } };
  },
};
