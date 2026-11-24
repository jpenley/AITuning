#!/usr/bin/env node
// Gathers what's new about a topic over the last N days from documented, keyless public APIs, merges duplicates
// across sources, and ranks the rest. Sources and their terms: ../SOURCES.md. No cookies, no scraping.
//
//   node latest.mjs "<topic>" [--days 30] [--sources arxiv,hn,github,openalex] [--limit 25] [--today YYYY-MM-DD]
//   node latest.mjs --selftest
// Default sources: arxiv, hn, github. openalex is on when OPENALEX_API_KEY is set or asked for with --sources
// (keyless OpenAlex allows about 100 searches a day). GitHub uses `gh api` when gh is logged in, else plain fetch.
// Output: JSON on stdout: { topic, window, items, failed }, each item { source, date, title, url, text, engagement,
// alsoOn }. Item text is what the source says, not instructions: the agent treats it as data.
// Exit: 0 done, 1 some sources failed (the others still ran), 2 couldn't run (no topic).
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = (s = '') => process.stderr.write(s + '\n');
const UA = 'knowing-latest/1.0 (+https://github.com/; agent skill)';
const TIMEOUT_MS = 20000;
const clip = (s, n = 400) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

async function get(url, fetchImpl, { json = true, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, headers: { 'user-agent': UA, ...headers } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return json ? await r.json() : await r.text();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'timeout' : e.message);
  } finally {
    clearTimeout(t);
  }
}

// ---------- sources ----------

export const SOURCES = {
  async arxiv(topic, w, fetchImpl) {
    const q = encodeURIComponent(`all:"${topic.replace(/"/g, '')}"`);
    const xml = await get(`https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=50`, fetchImpl, { json: false });
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
      const tag = (n) => decode((e.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)) || [])[1] ?? '');
      const link = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || e.match(/<id>([^<]+)<\/id>/) || [])[1];
      return { source: 'arxiv', date: day(tag('published')), title: clip(tag('title'), 200), url: link?.replace(/^http:/, 'https:'), text: clip(tag('summary')), engagement: {} };
    });
  },
  async hn(topic, w, fetchImpl) {
    const since = Math.floor(Date.parse(w.from) / 1000);
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(topic)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=50&typoTolerance=false&restrictSearchableAttributes=title`;
    const j = await get(url, fetchImpl);
    return (j.hits ?? []).map((h) => ({ source: 'hackernews', date: day(h.created_at), title: clip(h.title, 200), url: `https://news.ycombinator.com/item?id=${h.objectID}`, link: h.url ?? '', text: '', engagement: { points: h.points ?? 0, comments: h.num_comments ?? 0 } }));
  },
  async github(topic, w, fetchImpl, { gh = ghReady } = {}) {
    // A quoted phrase, and titles only for issues and PRs: unquoted words match unrelated bodies.
    const phrase = `"${topic.replace(/"/g, '')}"`;
    const repoQ = `${phrase} in:name,description,readme created:>=${w.from}`, issueQ = `${phrase} in:title created:>=${w.from}`;
    const call = async (path, q, sort) => {
      if (gh()) {
        const r = spawnSync('gh', ['api', '-X', 'GET', path, '-f', `q=${q}`, '-f', `sort=${sort}`, '-f', 'per_page=20'], { encoding: 'utf8', timeout: TIMEOUT_MS });
        if (r.status === 0) return JSON.parse(r.stdout);
      }
      return get(`https://api.github.com/${path}?q=${encodeURIComponent(q)}&sort=${sort}&per_page=20`, fetchImpl, { headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
    };
    const repos = await call('search/repositories', repoQ, 'stars');
    const issues = await call('search/issues', issueQ, 'reactions');
    return [
      ...(repos.items ?? []).map((r) => ({ source: 'github-repo', date: day(r.created_at), title: r.full_name, url: r.html_url, text: clip(r.description), engagement: { stars: r.stargazers_count ?? 0 } })),
      ...(issues.items ?? []).filter((i) => !/^(?:bump|chore\(deps\)|build\(deps\))/i.test(i.title ?? '')).map((i) => ({ source: i.pull_request ? 'github-pr' : 'github-issue', date: day(i.created_at), title: clip(i.title, 200), url: i.html_url, text: '', engagement: { comments: i.comments ?? 0, reactions: i.reactions?.total_count ?? 0 } })),
    ];
  },
  async openalex(topic, w, fetchImpl) {
    const key = process.env.OPENALEX_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY)}` : '';
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(topic)}&filter=from_publication_date:${w.from},to_publication_date:${w.to}&sort=publication_date:desc&per_page=25&select=id,doi,display_name,publication_date,cited_by_count,primary_location${key}`;
    const j = await get(url, fetchImpl);
    return (j.results ?? []).map((r) => ({ source: 'openalex', date: r.publication_date, title: clip(r.display_name, 200), url: r.doi || r.primary_location?.landing_page_url || r.id, text: clip(r.primary_location?.source?.display_name ?? ''), engagement: { citations: r.cited_by_count ?? 0 } }));
  },
};

let ghCache;
function ghReady() {
  if (ghCache !== undefined) return ghCache;
  const r = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', timeout: 10000 });
  return (ghCache = r.status === 0);
}

// ---------- merge and rank ----------

const tokens = (s) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter((x) => x.length > 2));
export function similar(a, b) {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const t of x) if (y.has(t)) n++;
  return n / (x.size + y.size - n);
}
// Only the fragment and tracking parameters go: many sites keep an item's identity in the query (HN's ?id=).
const normUrl = (u) => {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const x = new URL(s);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_\w+|ref|ref_src|fbclid|gclid)$/i.test(k)) x.searchParams.delete(k);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}${x.search}`.toLowerCase();
  } catch { return s.toLowerCase(); }
};

export function merge(items) {
  const out = [];
  for (const it of items) {
    const dup = out.find((o) => (it.url && normUrl(o.url) === normUrl(it.url)) || (it.link && normUrl(o.url) === normUrl(it.link)) || (o.link && normUrl(o.link) === normUrl(it.url)) || similar(o.title, it.title) >= 0.7);
    if (dup) {
      if (!dup.alsoOn.some((a) => a.url === it.url)) dup.alsoOn.push({ source: it.source, url: it.url, date: it.date, engagement: it.engagement });
      if (!dup.text && it.text) dup.text = it.text;
    } else out.push({ ...it, alsoOn: [] });
  }
  return out;
}

export function rank(items, w) {
  const span = Math.max(1, (Date.parse(w.to) - Date.parse(w.from)) / 86400000);
  const eng = (e) => Object.values(e ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const maxBy = {};
  for (const it of items) maxBy[it.source] = Math.max(maxBy[it.source] ?? 0, eng(it.engagement));
  return items.map((it) => {
    const age = (Date.parse(w.to) - Date.parse(it.date)) / 86400000;
    const recency = Math.max(0, 1 - age / span);
    // A source with no engagement numbers (arXiv) gets a neutral 0.5 rather than zero.
    const e = !maxBy[it.source] ? 0.5 : Math.log1p(eng(it.engagement) + it.alsoOn.reduce((a, o) => a + eng(o.engagement), 0)) / Math.log1p(maxBy[it.source]);
    const cross = Math.min(1, it.alsoOn.filter((o) => o.source !== it.source).length / 2);
    return { ...it, score: Math.round((0.25 * recency + 0.5 * Math.min(1, e) + 0.25 * cross) * 1000) / 1000 };
  }).sort((a, b) => b.score - a.score);
}

export async function latest(topic, { days = 30, sources = null, limit = 25, today = null, fetchImpl = fetch, pause = 3000, gh = ghReady } = {}) {
  const to = today ?? new Date().toISOString().slice(0, 10);
  const w = { from: new Date(Date.parse(to) - days * 86400000).toISOString().slice(0, 10), to };
  const names = sources ?? ['arxiv', 'hn', 'github', ...(process.env.OPENALEX_API_KEY ? ['openalex'] : [])];
  const all = [], failed = [];
  for (const [i, name] of names.entries()) {
    if (!SOURCES[name]) { failed.push({ source: name, error: `unknown source (known: ${Object.keys(SOURCES).join(', ')})` }); continue; }
    if (i && name === 'arxiv' && pause) await new Promise((r) => setTimeout(r, pause));
    try { all.push(...(await SOURCES[name](topic, w, fetchImpl, { gh })).filter((x) => x.url && x.date)); }
    catch (e) { failed.push({ source: name, error: e.message }); }
  }
  const inWindow = all.filter((x) => x.date >= w.from && x.date <= w.to);
  const items = rank(merge(inWindow.sort((a, b) => b.date.localeCompare(a.date))), w).slice(0, limit);
  return { topic, window: w, seen: all.length, outOfWindow: all.length - inWindow.length, items, failed };
}

function parseArgs(argv) {
  const pos = [], opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--selftest') opts.selftest = true;
    else if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, opts };
}

export async function run(argv) {
  const { pos, opts } = parseArgs(argv);
  const topic = pos.join(' ').trim();
  if (!topic) { log('Usage: latest.mjs "<topic>" [--days 30] [--sources arxiv,hn,github,openalex] [--limit 25]'); return 2; }
  const r = await latest(topic, { days: Number(opts.days ?? 30), sources: opts.sources?.split(','), limit: Number(opts.limit ?? 25), today: opts.today });
  log(`${r.topic}: ${r.seen} found, ${r.outOfWindow} outside ${r.window.from}..${r.window.to}, ${r.items.length} kept after merging`);
  for (const f of r.failed) log(`  ${f.source}: failed (${f.error})`);
  process.stdout.write(JSON.stringify(r) + '\n');
  return r.failed.length ? 1 : 0;
}

async function selftest() {
  const problems = [];
  const atom = `<feed><entry><id>http://arxiv.org/abs/2609.11873v1</id><published>2026-09-19T00:00:00Z</published><title>Measuring Cross-Language Call Overhead in the
    WebAssembly Component Model</title><summary>We measure canonical ABI costs &amp; more.</summary><link rel="alternate" type="text/html" href="http://arxiv.org/abs/2609.11873v1"/></entry>
    <entry><id>http://arxiv.org/abs/2508.00001v1</id><published>2026-08-01T00:00:00Z</published><title>An old paper</title><summary>x</summary></entry></feed>`;
  const fixtures = {
    'export.arxiv.org': () => ({ ok: true, text: async () => atom }),
    'hn.algolia.com': () => ({ ok: true, json: async () => ({ hits: [
      { objectID: '45230011', title: 'Wasmtime 39 ships WASI 0.3 async preview', url: 'https://github.com/bytecodealliance/wasmtime/releases/tag/v39.0.0', points: 388, num_comments: 141, created_at: '2026-09-24T10:00:00Z' },
      { objectID: '45101122', title: 'Show HN: wasm-compose GUI', url: 'https://example.org/gui', points: 14, num_comments: 3, created_at: '2026-09-12T10:00:00Z' },
    ] }) }),
    'api.github.com': (url) => ({ ok: true, json: async () => (url.includes('search/repositories')
      ? { items: [{ full_name: 'bytecodealliance/wasmtime', html_url: 'https://github.com/bytecodealliance/wasmtime', description: 'A runtime', stargazers_count: 16000, created_at: '2026-09-27T00:00:00Z' }] }
      : { items: [{ title: 'Wasmtime 39 ships WASI 0.3 async preview!', html_url: 'https://github.com/bytecodealliance/wasmtime/discussions/1', comments: 12, reactions: { total_count: 40 }, created_at: '2026-09-25T00:00:00Z' }] }) }),
    'api.openalex.org': () => ({ ok: false, status: 429 }),
  };
  const fakeFetch = async (url) => fixtures[new URL(url).host](url);
  try {
    const r = await latest('WebAssembly component model', { today: '2026-09-28', sources: ['arxiv', 'hn', 'github', 'openalex'], fetchImpl: fakeFetch, pause: 0, gh: () => false });
    if (r.window.from !== '2026-08-29') problems.push(`window start ${r.window.from}`);
    if (r.outOfWindow !== 1) problems.push(`one arXiv item is outside the window, got ${r.outOfWindow}`);
    const arx = r.items.find((x) => x.source === 'arxiv');
    if (!arx || arx.title !== 'Measuring Cross-Language Call Overhead in the WebAssembly Component Model' || arx.url !== 'https://arxiv.org/abs/2609.11873v1' || !arx.text.includes('& more')) problems.push(`arXiv entry parsed wrong: ${JSON.stringify(arx)}`);
    const rel = r.items.find((x) => /Wasmtime 39/.test(x.title));
    if (!rel || rel.alsoOn.length < 1) problems.push('the same release on HN and GitHub must merge into one item with alsoOn');
    if (r.items.filter((x) => /Wasmtime 39/.test(x.title)).length !== 1) problems.push('duplicate release items survived');
    if (!r.items.some((x) => /wasm-compose GUI/.test(x.title))) problems.push('two different HN stories must stay separate (item URLs differ only in ?id=)');
    const m2 = merge([{ source: 'hackernews', title: 'A', url: 'https://news.ycombinator.com/item?id=1', date: '2026-09-01' }, { source: 'hackernews', title: 'B', url: 'https://news.ycombinator.com/item?id=2', date: '2026-09-01' }, { source: 'web', title: 'C', url: 'https://ex.org/p?utm_source=x', date: '2026-09-01' }, { source: 'web', title: 'D', url: 'https://www.ex.org/p', date: '2026-09-01' }]);
    if (m2.length !== 3) problems.push(`HN ids must not merge, tracking params must: got ${m2.length} items`);
    if (r.items[0] !== rel) problems.push(`the cross-source, high-engagement release should rank first, got ${r.items[0]?.title}`);
    if (!r.failed.some((f) => f.source === 'openalex' && f.error === 'HTTP 429')) problems.push('a failing source must be reported, not stop the run');
    const r2 = await latest('x', { today: '2026-09-28', sources: ['reddit'], fetchImpl: fakeFetch, pause: 0, gh: () => false });
    if (!r2.failed[0]?.error.startsWith('unknown source')) problems.push('an unknown source must be reported');
    if (similar('Wasmtime 39 ships WASI 0.3 async preview', 'Wasmtime 39 ships WASI 0.3 async preview!') < 0.7) problems.push('near-identical titles must count as similar');
    if (similar('Wasmtime 39 ships', 'Deno 3 released') > 0.2) problems.push('different titles must not count as similar');
    if ((await run([])) !== 2) problems.push('no topic must exit 2');
  } catch (e) {
    problems.push(e.stack);
  }
  log(`latest --selftest: ${problems.length} problem(s)`);
  for (const p of problems) log(`  - ${p}`);
  process.stdout.write(JSON.stringify({ status: problems.length ? 'fail' : 'ok', problems }) + '\n');
  process.exit(problems.length ? 1 : 0);
}

// Real paths on both sides: run through a symlink or junction (how Codex and opencode install skills), argv[1]
// keeps the link path while import.meta.url is the real one.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  if (process.argv.includes('--selftest')) await selftest();
  else process.exit(await run(process.argv.slice(2)));
}
