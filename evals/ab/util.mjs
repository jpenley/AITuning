// Helpers the A/B moments share (ab/moments/*.mjs). Datasets are deterministic: no clock, no randomness at load time.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AB_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO = join(AB_DIR, '..', '..');
export const readData = (name) => JSON.parse(readFileSync(join(AB_DIR, 'data', `${name}.json`), 'utf8'));

// Accuracy over every item: an item with no prediction is wrong. Returns the `score` shape ab.mjs wants.
export function scoreExact(dataset, preds, want = (it) => it.want) {
  const correct = {};
  for (const it of dataset.items) correct[it.id] = it.id in preds && preds[it.id] === want(it);
  const n = Object.values(correct).filter(Boolean).length;
  return { primary: dataset.items.length ? n / dataset.items.length : 0, primaryName: 'accuracy', metrics: { correct: n, of: dataset.items.length }, correct };
}

// Binary detection (e.g. injected or not): recall of the positives and the false-positive rate on the negatives.
export function scoreBinary(dataset, flagged, isPositive = (it) => it.want === true) {
  const correct = {};
  let tp = 0; let fn = 0; let fp = 0; let tn = 0;
  for (const it of dataset.items) {
    const pos = isPositive(it);
    const hit = it.id in flagged && flagged[it.id] === true;
    const answered = it.id in flagged;
    correct[it.id] = answered && hit === pos;
    if (pos) { if (hit) tp++; else fn++; } else if (hit) fp++; else if (answered) tn++;
  }
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const fpr = fp + tn ? fp / (fp + tn) : 0;
  return { primary: recall, primaryName: 'recall', metrics: { recall, falsePositiveRate: fpr, tp, fn, fp, tn }, correct };
}

// recall at k for ranked answers: the item's `gold` ids appear in the first k of its ranking.
export function scoreRanked(dataset, rankings, ks = [1, 3]) {
  const correct = {};
  const hits = Object.fromEntries(ks.map((k) => [k, 0]));
  for (const it of dataset.items) {
    const r = rankings[it.id] ?? [];
    for (const k of ks) if (it.gold.some((g) => r.slice(0, k).includes(g))) hits[k]++;
    correct[it.id] = it.gold.some((g) => r.slice(0, ks[0]).includes(g));
  }
  const n = dataset.items.length || 1;
  return { primary: hits[ks[0]] / n, primaryName: `hit@${ks[0]}`, metrics: Object.fromEntries(ks.map((k) => [`hit@${k}`, hits[k] / n])), correct };
}
