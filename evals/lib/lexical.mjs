// Lexical routing (stemmed TF-IDF over skill descriptions), shared by triggers.mjs (Tier 2) and route.mjs
// (its comparison baseline). Adapted from addyosmani/agent-skills scripts/run-evals.js (MIT).


const STOP = new Set([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'before', 'by', 'can', 'for', 'from', 'how', 'i', 'in',
  'into', 'is', 'it', 'its', 'let', 'me', 'my', 'need', 'needs', 'of', 'on', 'or', 'our', 'please', 'so',
  'that', 'the', 'them', 'this', 'to', 'use', 'want', 'we', 'what', 'when', 'with', 'you', 'your', 'help',
]);

export function stem(t) {
  for (const suf of ['ally', 'ing', 'ed', 'es', 'al']) {
    if (t.length > suf.length + 3 && t.endsWith(suf)) { t = t.slice(0, -suf.length); break; }
  }
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1);
  if (t.length > 4 && t[t.length - 1] === t[t.length - 2] && !'aeiou'.includes(t[t.length - 1])) t = t.slice(0, -1);
  if (t.length > 3 && t.endsWith('y')) t = t.slice(0, -1) + 'i';
  return t;
}

export const tokenize = (text) =>
  text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((t) => t.length > 2 && !STOP.has(t)).map(stem);

export const termFreq = (tokens) => {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
};

export function buildCorpus(skills) {
  const docs = new Map();
  for (const s of skills) {
    const nameTokens = tokenize(s.name.replace(/-/g, ' '));
    docs.set(s.name, termFreq([...nameTokens, ...nameTokens, ...tokenize(s.description)]));
  }
  const df = new Map();
  for (const tf of docs.values()) for (const term of tf.keys()) df.set(term, (df.get(term) || 0) + 1);
  const n = docs.size;
  return { docs, idf: (term) => Math.log(1 + n / (1 + (df.get(term) || 0))) };
}

export const vec = (tf, idf) => new Map([...tf].map(([t, f]) => [t, f * idf(t)]));

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [t, w] of a) { na += w * w; const bw = b.get(t); if (bw) dot += w * bw; }
  for (const w of b.values()) nb += w * w;
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function rank(prompt, corpus) {
  const pv = vec(termFreq(tokenize(prompt)), corpus.idf);
  return [...corpus.docs]
    .map(([name, tf]) => ({ name, score: cosine(pv, vec(tf, corpus.idf)) }))
    .sort((a, b) => b.score - a.score);
}

// A fixed ~40% of positive prompts is held out, chosen by a hash of the prompt text so it never changes with
// case order.
export const heldOut = (prompt) => [...prompt].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 10 < 4;
