#!/usr/bin/env node
// Checks citations against Crossref's public REST API: does each DOI resolve, do the cited title and year match the
// record, and has the work been retracted, corrected, or given an expression of concern (Crossref carries the
// Retraction Watch database as `updated-by` entries, `source` "retraction-watch" or "publisher"). Keyless. Checked
// against https://api.crossref.org/swagger-docs and
// https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/ on 2026-09-28, then read live.
//
//   node cite.mjs "<DOI or reference>" [...]      each argument is a DOI, a doi.org link, or one reference line
//   node cite.mjs --file refs.txt                 one reference per line; blank lines are skipped
//   node cite.mjs --selftest
// A reference line with a DOI is checked by that DOI, and the rest of the line is the claim its title and year are
// compared with (the record's title words must appear in the line, so a longer title that contains a short one, such
// as "Deep learning" inside "Deep learning in the brain", still counts as a match). A line without one is searched for (query.bibliographic); the best hit counts only when its title
// and year both match the line, otherwise it is reported as unmatched with the candidate shown.
// Set CROSSREF_MAILTO to an email address to use Crossref's polite pool; nothing else identifies the user.
// Output: JSON on stdout: { status, results, failed }. Each result: { input, doi, via, verdict, title, year, container,
//   type, titleMatch, yearMatch, updates, notices, candidate }. verdict is one of retracted, concern, corrected,
//   notice (the DOI is itself a retraction or correction notice), ok, not-found, unmatched.
// Exit: 0 done, 1 some lookups failed (network, rate limit; the others still ran), 2 couldn't run (no input).
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = (s = '') => process.stderr.write(s + '\n');
const API = 'https://api.crossref.org';
const TIMEOUT_MS = 20000;
const PAUSE_MS = 250; // Crossref's public pool allows a few requests a second; one at a time stays well inside it
const MATCH = 0.8; // share of the record's title words that must appear in the cited text

// Crossref's update types, normalised (it holds variants such as "expression-of-concern", "Erratum", "retration").
const KIND = (t) => {
  const k = String(t ?? '').toLowerCase().replace(/[-\s]+/g, '_');
  if (/^(retr|partial_retraction|withdrawal|removal)/.test(k)) return 'retracted';
  if (k === 'expression_of_concern') return 'concern';
  if (/^(correction|corrigendum|erratum|err|corrected|corrected_article|addendum|clarification)$/.test(k)) return 'corrected';
  return 'other';
};
const RANK = { retracted: 3, concern: 2, corrected: 1, other: 0 };

// DOIs end at whitespace; a trailing ")" belongs to the DOI only when it closes a "(" inside it (10.1016/S0140-6736(97)11096-0).
export function findDoi(text) {
  const m = String(text).match(/\b(10\.\d{4,9}\/[^\s"<>]+)/i);
  if (!m) return null;
  let d = decodeURIComponent(m[1].replace(/%(?![0-9a-f]{2})/gi, '%25'));
  for (;;) {
    const before = d;
    d = d.replace(/[.,;:\]]+$/, '');
    if (d.endsWith(')') && (d.match(/\(/g) ?? []).length < (d.match(/\)/g) ?? []).length) d = d.slice(0, -1);
    if (d === before) break;
  }
  return d;
}

const STOP = new Set('the a an of and or in on for to with by from at as is are be its their this that into via using'.split(' '));
const words = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
// Notices prefix the title ("RETRACTED: ...", "Retraction: ..."); the claim cites the original title.
const bareTitle = (t) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/^\s*(retracted|retraction|withdrawn|expression of concern|correction|erratum)\s*(article)?\s*[:.-]\s*/i, '');

export function titleMatch(recordTitle, claim) {
  const want = words(bareTitle(recordTitle));
  const have = new Set(words(claim));
  if (!want.length || have.size < 3) return null; // nothing to compare against
  return want.filter((w) => have.has(w)).length / want.length >= MATCH;
}
export function yearMatch(years, claim) {
  const cited = [...String(claim ?? '').matchAll(/\b(1[89]\d\d|20\d\d)\b/g)].map((m) => +m[1]);
  if (!cited.length || !years.length) return null;
  return cited.some((c) => years.some((y) => Math.abs(c - y) <= 1)); // print and online dates can straddle a year
}

const yearsOf = (m) => [...new Set(['issued', 'published-print', 'published-online', 'published'].map((k) => m[k]?.['date-parts']?.[0]?.[0]).filter(Number.isInteger))];
const dateOf = (u) => (u.updated?.['date-time'] ?? '').slice(0, 10);
function updatesOf(list) {
  const seen = new Map(); // Retraction Watch and the publisher often both report the same notice
  for (const u of list ?? []) {
    const key = `${String(u.DOI).toLowerCase()}|${KIND(u.type)}`;
    const prev = seen.get(key);
    const entry = { kind: KIND(u.type), type: u.label ?? u.type, notice: u.DOI, date: dateOf(u), source: prev && prev.source !== u.source ? 'publisher, retraction-watch' : u.source };
    seen.set(key, prev ? { ...entry, source: [...new Set([...prev.source.split(', '), u.source])].sort().join(', ') } : entry);
  }
  return [...seen.values()].sort((a, b) => RANK[b.kind] - RANK[a.kind] || a.date.localeCompare(b.date));
}

// One Crossref work record plus the cited claim -> a result.
export function judge(m, claim) {
  const updates = updatesOf(m['updated-by']).filter((u) => u.kind !== 'other');
  const notices = updatesOf(m['update-to']).filter((u) => u.kind !== 'other');
  // Last resort when Crossref holds no relation: publishers retitle a retracted paper "RETRACTED: ..." or "WITHDRAWN: ...".
  const raw = String(m.title?.[0] ?? '').replace(/<[^>]+>/g, '');
  if (!updates.length && /^\s*(retracted|withdrawn)\b(\s+article)?\s*[:.-]/i.test(raw)) updates.push({ kind: 'retracted', type: 'Title marked retracted', notice: null, date: '', source: 'title' });
  const years = yearsOf(m);
  const worst = updates[0]?.kind;
  return {
    doi: m.DOI, title: bareTitle(m.title?.[0] ?? '').replace(/\s+/g, ' ').trim(), year: Math.min(...years) === Infinity ? null : Math.min(...years),
    container: m['container-title']?.[0] ?? '', type: m.type ?? '',
    titleMatch: titleMatch(m.title?.[0], claim), yearMatch: yearMatch(years, claim),
    verdict: worst ?? (notices.length ? 'notice' : 'ok'), updates, notices,
  };
}

function headers() {
  const mailto = process.env.CROSSREF_MAILTO?.trim();
  return { accept: 'application/json', 'user-agent': `knowing-investigate-cite/1.0 (citation check; agent skill${mailto ? `; mailto:${mailto}` : ''})` };
}
// A 429 is retried twice, after the Retry-After the API sends (capped at 10 s), before the lookup counts as failed.
const timing = { wait: (ms) => new Promise((r) => setTimeout(r, ms)) }; // the selftest makes waits instant
async function getJson(url, fetchImpl, { retries = 2, wait = timing.wait } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetchImpl(url, { signal: ctl.signal, headers: headers() });
      if (r.status === 404) return null;
      if (r.status === 429 && attempt < retries) {
        await wait(Math.min(10, Number(r.headers?.get?.('retry-after')) || 2 ** attempt * 2) * 1000);
        continue;
      }
      if (!r.ok) throw new Error(r.status === 429 ? 'HTTP 429 (rate limited; wait a minute and run again)' : `HTTP ${r.status}`);
      return (await r.json()).message;
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'timeout' : e.message);
    } finally {
      clearTimeout(t);
    }
  }
}
const withMailto = (url) => (process.env.CROSSREF_MAILTO?.trim() ? `${url}${url.includes('?') ? '&' : '?'}mailto=${encodeURIComponent(process.env.CROSSREF_MAILTO.trim())}` : url);
const workUrl = (doi) => withMailto(`${API}/works/${doi.split('/').map(encodeURIComponent).join('/')}`);

export async function check(input, fetchImpl = fetch) {
  const doi = findDoi(input);
  if (doi) {
    const claim = input.replace(/\S*10\.\d{4,9}\/\S+/i, ' ');
    const m = await getJson(workUrl(doi), fetchImpl);
    if (!m) return { input, doi, via: 'doi', verdict: 'not-found' };
    return { input, via: 'doi', ...judge(m, claim) };
  }
  const hits = await getJson(withMailto(`${API}/works?query.bibliographic=${encodeURIComponent(input)}&rows=1`), fetchImpl);
  const top = hits?.items?.[0];
  if (!top) return { input, doi: null, via: 'search', verdict: 'unmatched', candidate: null };
  const first = judge(top, input);
  if (!(first.titleMatch && first.yearMatch !== false)) {
    return { input, doi: null, via: 'search', verdict: 'unmatched', candidate: { doi: first.doi, title: first.title, year: first.year, titleMatch: first.titleMatch, yearMatch: first.yearMatch } };
  }
  const m = await getJson(workUrl(top.DOI), fetchImpl); // the full record, so every update relation is present
  return { input, via: 'search', ...judge(m ?? top, input) };
}

function parseArgs(argv) {
  const inputs = [];
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') file = argv[++i];
    else if (!argv[i].startsWith('--')) inputs.push(argv[i]);
  }
  return { inputs, file };
}

export async function run(argv, { fetchImpl = fetch, out = (s) => process.stdout.write(s + '\n'), err = log, pause = PAUSE_MS, readFile = (f) => readFileSync(f, 'utf8') } = {}) {
  const { inputs, file } = parseArgs(argv);
  if (file) {
    try { inputs.push(...readFile(resolve(file)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)); } catch (e) { err(`can't read ${file}: ${e.message}`); return 2; }
  }
  if (!inputs.length) { err('Usage: cite.mjs "<DOI or reference>" [...] | --file refs.txt'); return 2; }
  const results = [];
  const failed = [];
  for (const [i, input] of inputs.entries()) {
    if (i && pause) await new Promise((r) => setTimeout(r, pause));
    try {
      const r = await check(input, fetchImpl);
      results.push(r);
      const mism = [r.titleMatch === false && 'title differs', r.yearMatch === false && 'year differs'].filter(Boolean);
      const what = r.updates?.length ? `: ${r.updates.map((u) => [u.type, u.date, u.notice && `(${u.notice})`].filter(Boolean).join(' ')).join('; ')}` : '';
      err(`${r.verdict.toUpperCase().padEnd(9)} ${r.doi ?? input.slice(0, 60)}${what}${mism.length ? ` [${mism.join(', ')}]` : ''}`);
    } catch (e) {
      failed.push({ input, error: e.message });
      err(`FAILED    ${input.slice(0, 60)}: ${e.message}`);
    }
  }
  out(JSON.stringify({ status: failed.length ? 'partial' : 'ok', results, failed }));
  return failed.length ? 1 : 0;
}

// ---------- selftest: recorded Crossref responses (trimmed from live calls on 2026-09-28); no network ----------
async function selftest() {
  const problems = [];
  const rw = (doi, type, label, date, source = 'retraction-watch') => ({ DOI: doi, type, label, source, updated: { 'date-time': `${date}T00:00:00Z` } });
  const works = {
    // The Wakefield paper: a Retraction Watch correction (2004) and retraction (2010).
    '10.1016/s0140-6736(97)11096-0': { DOI: '10.1016/S0140-6736(97)11096-0', type: 'journal-article', title: ['RETRACTED: Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children'], 'container-title': ['The Lancet'], issued: { 'date-parts': [[1998, 2]] },
      'updated-by': [rw('10.1016/s0140-6736(04)15715-2', 'correction', 'Correction', '2004-03-06'), rw('10.1016/s0140-6736(10)60175-4', 'retraction', 'Retraction', '2010-02-06')] },
    '10.1038/nature14539': { DOI: '10.1038/nature14539', type: 'journal-article', title: ['Deep learning'], 'container-title': ['Nature'], issued: { 'date-parts': [[2015, 5, 27]] } },
    // Retracted, reported twice (publisher and Retraction Watch): must come out as one entry.
    '10.1111/iwj.14487': { DOI: '10.1111/iwj.14487', type: 'journal-article', title: ['RETRACTED: A meta‐analysis of the effectiveness of antibacterial bone cement'], issued: { 'date-parts': [[2023, 11]] },
      'updated-by': [rw('10.1111/iwj.70185', 'retraction', 'Retraction', '2025-01-12'), rw('10.1111/iwj.70185', 'retraction', 'Retraction', '2025-01-12', 'publisher')] },
    // The retraction notice itself.
    '10.1111/iwj.70185': { DOI: '10.1111/iwj.70185', type: 'journal-article', title: ['<scp>RETRACTION</scp>: A Meta‐Analysis of the Effectiveness of Antibacterial Bone Cement'], issued: { 'date-parts': [[2025, 1]] },
      'update-to': [rw('10.1111/iwj.14487', 'retraction', 'Retraction', '2025-01-12')] },
    '10.5555/titled': { DOI: '10.5555/titled', title: ['WITHDRAWN: A paper with no relation deposited'], issued: { 'date-parts': [[2019]] } },
    '10.1159/000494475': { DOI: '10.1159/000494475', type: 'journal-article', title: ['Some cell study'], issued: { 'date-parts': [[2018]] },
      'updated-by': [rw('10.33594/000000430', 'expression-of-concern', 'Expression of concern', '2021-04-01'), rw('10.1159/x', 'new_version', 'New version', '2019-01-01', 'publisher')] },
  };
  const search = {
    deep: { items: [works['10.1038/nature14539']] },
    avocado: { items: [{ DOI: '10.4324/9781003371915-4', title: ['Avocado Toast'], issued: { 'date-parts': [[2023, 10, 4]] } }] },
  };
  const calls = [];
  const waits = [];
  timing.wait = async (ms) => { waits.push(ms); };
  let flaky = 0;
  const fakeFetch = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const limited = { ok: false, status: 429, headers: new Headers({ 'retry-after': '1' }), json: async () => ({}) };
    if (u.pathname === '/works') {
      const q = u.searchParams.get('query.bibliographic') ?? '';
      if (/rate/.test(q)) return limited;
      if (/flaky/.test(q) && flaky++ === 0) return limited;
      const hit = /Deep learning/.test(q) ? search.deep : /avocado/i.test(q) ? search.avocado : { items: [] };
      return { ok: true, status: 200, json: async () => ({ message: hit }) };
    }
    const doi = decodeURIComponent(u.pathname.replace(/^\/works\//, '')).toLowerCase();
    return works[doi] ? { ok: true, status: 200, json: async () => ({ message: works[doi] }) } : { ok: false, status: 404, json: async () => ({}) };
  };
  const outs = [];
  const quiet = () => {};
  const go = (args, extra = {}) => run(args, { fetchImpl: fakeFetch, out: (s) => outs.push(JSON.parse(s)), err: quiet, pause: 0, ...extra });
  const by = () => outs.at(-1).results;

  if ((await go([])) !== 2) problems.push('no input must exit 2');
  const refs = [
    'Wakefield AJ, et al. Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. Lancet 1998;351:637-41. doi:10.1016/S0140-6736(97)11096-0.',
    'https://doi.org/10.1038/nature14539',
    'LeCun Y. Convolutional networks for images and speech. Science 2012. 10.1038/nature14539',
    '10.1111/iwj.14487',
    '10.1111/iwj.70185',
    '10.1159/000494475',
    '10.9999/does-not-exist',
    'LeCun Y, Bengio Y, Hinton G. Deep learning. Nature 2015;521:436-444',
    'Smith J. Quantum entanglement of avocado toast in millennial housing markets. J Imaginary Econ 2019',
    'Nobody. Nothing matches this at all 2001',
  ];
  if ((await go(['--file', 'refs.txt'], { readFile: () => refs.join('\n') + '\n\n' })) !== 0) problems.push('a clean run must exit 0');
  const r = by();
  const expect = (i, pred, why) => { if (!r[i] || !pred(r[i])) problems.push(`${why}: got ${JSON.stringify(r[i])}`); };
  expect(0, (x) => x.doi === '10.1016/S0140-6736(97)11096-0', 'a DOI ending in ")" followed by "." must keep its closing parenthesis');
  expect(0, (x) => x.verdict === 'retracted' && x.updates[0].kind === 'retracted' && x.updates[0].date === '2010-02-06' && x.updates.length === 2, 'Wakefield must be retracted (2010) with its 2004 correction listed after');
  expect(0, (x) => x.titleMatch === true && x.yearMatch === true, 'a correct citation of a "RETRACTED:" title must match');
  expect(1, (x) => x.verdict === 'ok' && x.titleMatch === null && x.yearMatch === null, 'a bare doi.org link has nothing to compare and is ok');
  expect(2, (x) => x.titleMatch === false && x.yearMatch === false, 'a wrong title and year cited with a real DOI must both mismatch');
  expect(3, (x) => x.verdict === 'retracted' && x.updates.length === 1 && x.updates[0].source === 'publisher, retraction-watch', 'a notice reported by both sources must be one entry');
  expect(4, (x) => x.verdict === 'notice' && x.notices[0].notice === '10.1111/iwj.14487', 'a retraction notice cited as a source must be flagged as a notice');
  expect(4, (x) => !/scp|RETRACTION/.test(x.title), 'markup and the notice prefix must be stripped from titles');
  expect(5, (x) => x.verdict === 'concern' && x.updates.length === 1, 'an expression of concern (hyphenated type) must be found, and a new version ignored');
  expect(6, (x) => x.verdict === 'not-found', 'an unknown DOI must be not-found');
  expect(7, (x) => x.via === 'search' && x.doi === '10.1038/nature14539' && x.verdict === 'ok', 'a reference without a DOI must be found by search');
  expect(8, (x) => x.verdict === 'unmatched' && x.candidate?.doi === '10.4324/9781003371915-4' && x.candidate.yearMatch === false, 'a search hit whose year differs must stay unmatched, with the candidate shown');
  expect(9, (x) => x.verdict === 'unmatched' && x.candidate === null, 'no search hit must be unmatched');
  waits.length = 0;
  if ((await go(['10.1038/nature14539', 'rate limited reference'])) !== 1 || outs.at(-1).failed[0]?.error.includes('429') !== true || by().length !== 1) problems.push('a rate-limited lookup must be reported as failed, exit 1, and not stop the others');
  if (waits.join() !== '1000,1000') problems.push(`a 429 must be retried twice after its Retry-After, waited ${waits.join()}`);
  if ((await go(['a flaky reference 2001'])) !== 0 || by()[0]?.verdict !== 'unmatched') problems.push('one 429 then an answer must succeed');
  process.env.CROSSREF_MAILTO = 'someone@example.org';
  calls.length = 0;
  await go(['10.1038/nature14539']);
  if (!calls[0]?.includes('mailto=someone%40example.org')) problems.push('CROSSREF_MAILTO must be sent as mailto');
  delete process.env.CROSSREF_MAILTO;
  calls.length = 0;
  await go(['10.1038/nature14539']);
  if (calls[0]?.includes('mailto')) problems.push('without CROSSREF_MAILTO no mailto may be sent');
  await go(['10.5555/titled', '10.1111/iwj.70185']);
  if (by()[0]?.verdict !== 'retracted' || by()[0]?.updates[0]?.source !== 'title') problems.push('a "WITHDRAWN:" title with no relation must count as retracted');
  if (by()[1]?.verdict !== 'notice') problems.push('a "RETRACTION:" notice title must stay a notice, not a retracted paper');
  if (findDoi('see (doi:10.1000/xyz123).') !== '10.1000/xyz123') problems.push('a DOI inside parentheses must drop the closing one');
  if (findDoi('https://doi.org/10.1016/S0140-6736%2897%2911096-0') !== '10.1016/S0140-6736(97)11096-0') problems.push('a percent-encoded DOI link must decode');

  log(`cite --selftest: ${problems.length} problem(s)`);
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
