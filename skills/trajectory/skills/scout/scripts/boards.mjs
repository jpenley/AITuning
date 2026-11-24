#!/usr/bin/env node
// Reads the public job-board APIs that Greenhouse, Lever and Ashby publish for companies' own careers pages, filters
// the postings, and adds new ones to <workspace>/inbox.md. Documented, unauthenticated GET endpoints only; no scraping.
// Where each endpoint was checked: ../SOURCES.md.
//
//   node boards.mjs scan <ats>:<board> [<ats>:<board> ...] [--match <regex>] [--where <regex>] [--dry-run]
//   node boards.mjs show <posting-id>              print one posting's plain-text description (for evaluate)
//   node boards.mjs --selftest
// <ats> is greenhouse, lever, lever-eu, or ashby; <board> is the company's board name from its careers URL
// (boards.greenhouse.io/<board>, jobs.lever.co/<board>, jobs.ashbyhq.com/<board>).
// --match filters titles, --where filters locations (case-insensitive regexes). --workspace <dir> as in tracker.mjs.
// Each posting carries `posted`, `ageDays` and `checks`: facts from the API that hint a posting is stale or evergreen
// (see freshness below). An inbox line with checks ends "| check: ...".
// Exit: 0 done, 1 some boards failed (the others still ran), 2 couldn't run (no workspace, bad arguments).
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const log = (s = '') => process.stderr.write(s + '\n');
const TIMEOUT_MS = 20000;
const PAUSE_MS = 500; // between boards: these are companies' own endpoints, not a bulk API

export const ATS = {
  greenhouse: {
    // pay_transparency is documented for the one-job endpoint; the list endpoint honours it too (checked live).
    url: (b) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b)}/jobs?content=true&pay_transparency=true`,
    list: (j) => j.jobs ?? [],
    norm: (p, b) => ({
      id: `greenhouse:${b}:${p.id}`, company: b, title: p.title, location: p.location?.name ?? '', url: p.absolute_url,
      // first_published, not updated_at: large boards bump updated_at on every post daily, so it says nothing.
      posted: (p.first_published ?? '').slice(0, 10), team: (p.departments ?? []).map((d) => d.name).join(', '),
      text: htmlToText(decodeEntities(p.content ?? '')),
      salary: (p.pay_input_ranges ?? []).map((r) => `${r.min_cents / 100}-${r.max_cents / 100} ${r.currency_type}`).join('; '),
    }),
  },
  lever: {
    url: (b) => `https://api.lever.co/v0/postings/${encodeURIComponent(b)}?mode=json`,
    list: (j) => (Array.isArray(j) ? j : []),
    norm: (p, b, ats = 'lever') => ({
      id: `${ats}:${b}:${p.id}`, company: b, title: p.text, location: p.categories?.location ?? '', url: p.hostedUrl,
      posted: p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : '', team: [p.categories?.department, p.categories?.team].filter(Boolean).join(', '),
      text: [p.descriptionPlain, ...(p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content ?? '')}`), p.additionalPlain].filter(Boolean).join('\n\n'),
      salary: p.salaryRange ? `${p.salaryRange.min}-${p.salaryRange.max} ${p.salaryRange.currency} per ${p.salaryRange.interval}` : '',
    }),
  },
  ashby: {
    url: (b) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b)}?includeCompensation=true`,
    list: (j) => (j.jobs ?? []).filter((p) => p.isListed !== false),
    norm: (p, b) => ({
      id: `ashby:${b}:${p.id ?? p.jobUrl}`, company: b, title: p.title, location: [p.location, p.isRemote ? 'Remote' : '', p.workplaceType ?? ''].filter(Boolean).join(', '),
      url: p.jobUrl, posted: (p.publishedAt ?? '').slice(0, 10), team: [p.department, p.team].filter(Boolean).join(', '), text: p.descriptionPlain ?? '', salary: p.compensation?.compensationTierSummary ?? '',
    }),
  },
};
ATS['lever-eu'] = { ...ATS.lever, url: (b) => `https://api.eu.lever.co/v0/postings/${encodeURIComponent(b)}?mode=json`, norm: (p, b) => ATS.lever.norm(p, b, 'lever-eu') };

export function decodeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
export function htmlToText(html) {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*(p|div|h[1-6]|ul|ol|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(lt|gt|quot|#39|nbsp|amp);/g, (m) => decodeEntities(m))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function findWorkspace(start) {
  let d = resolve(start);
  for (;;) {
    if (existsSync(join(d, 'trajectory.md'))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

// The inbox is a checklist; each posting line ends with an HTML comment carrying its id, so repeat scans skip it.
export const inboxLine = (p) => `- [ ] ${p.title} | ${p.company} | ${p.location || 'location not stated'} | ${p.url}${p.salary ? ` | ${p.salary}` : ''}${p.checks?.length ? ` | check: ${p.checks.join('; ')}` : ''} <!-- ${p.id} -->`;
export const knownIds = (src) => new Set([...src.matchAll(/<!--\s*(\S+)\s*-->/g)].map((m) => m[1]));

export function filter(postings, match, where) {
  const m = match ? new RegExp(match, 'i') : null;
  const w = where ? new RegExp(where, 'i') : null;
  return postings.filter((p) => (!m || m.test(p.title)) && (!w || w.test(p.location)));
}

// ---------- freshness checks: only from fields the board API returns ----------
// Each check names a fact about the posting; none is a verdict. Signals tried on live boards and dropped as noise are
// listed in ../SOURCES.md.

export const OLD_DAYS = 90;
export const REPOST_GAP_DAYS = 30;
// Evergreen wording in the title or the department/team name. The description is not read: boilerplate such as
// "the broadest talent pool" or "evergreen pages" matched far more real roles than pipeline postings.
const EVERGREEN = /\b(evergreen|talent (pool|community|network)|general (application|interest)|future (opportunities|openings)|open application|expression of interest|always hiring)\b|[-–—:(]\s*pipeline\b/i;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const squash = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const sameRole = (p) => `${squash(p.title)}|${squash(p.location)}`;

// Adds ageDays and checks to each posting of one board; `all` is the whole board, so repeats are found before filtering.
export function freshness(all, today) {
  const byRole = new Map();
  for (const p of all) (byRole.get(sameRole(p)) ?? byRole.set(sameRole(p), []).get(sameRole(p))).push(p);
  return all.map((p) => {
    const checks = [];
    const ageDays = p.posted ? daysBetween(p.posted, today) : null;
    if (ageDays !== null && ageDays > OLD_DAYS) checks.push(`posted ${ageDays} days ago (${p.posted})`);
    if (EVERGREEN.test(p.title)) checks.push(`pipeline or evergreen wording in the title`);
    else if (EVERGREEN.test(p.team ?? '')) checks.push(`listed under the pipeline or evergreen team "${p.team}"`);
    const twins = (byRole.get(sameRole(p)) ?? []).filter((o) => o !== p && o.posted && p.posted && Math.abs(daysBetween(o.posted, p.posted)) >= REPOST_GAP_DAYS);
    if (twins.length) checks.push(`same title and location also posted ${twins.map((o) => o.posted).sort().join(', ')}`);
    return { ...p, ageDays, checks };
  });
}

async function getJson(url, fetchImpl) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function scanBoard(spec, fetchImpl = fetch, today = new Date().toISOString().slice(0, 10)) {
  const [ats, board] = spec.split(':');
  const a = ATS[ats];
  if (!a || !board) throw new Error(`"${spec}" is not <ats>:<board> with ats one of ${Object.keys(ATS).join(', ')}`);
  const json = await getJson(a.url(board), fetchImpl);
  return freshness(a.list(json).map((p) => a.norm(p, board)), today);
}

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--selftest') opts[a.slice(2)] = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else pos.push(a);
  }
  return { pos, opts };
}

export async function run(argv, { cwd = process.cwd(), fetchImpl = fetch, out = (s) => process.stdout.write(s + '\n'), err = log, pause = PAUSE_MS, today = new Date().toISOString().slice(0, 10) } = {}) {
  const { pos, opts } = parseArgs(argv);
  const [cmd, ...rest] = pos;
  const ws = opts.workspace ? resolve(cwd, opts.workspace) : findWorkspace(cwd);
  if (!ws) { err('No trajectory workspace: no trajectory.md here or above. Load the profile skill to create one, or pass --workspace.'); return 2; }
  if (cmd === 'show') {
    const id = rest[0];
    const [ats, board] = (id ?? '').split(':');
    if (!ATS[ats] || !board) { err('show needs a posting id like greenhouse:acme:12345 (from the inbox)'); return 2; }
    try {
      const p = (await scanBoard(`${ats}:${board}`, fetchImpl, today)).find((x) => x.id === id);
      if (!p) { err(`${id} is no longer on the board (filled or withdrawn).`); out(JSON.stringify({ status: 'gone', id })); return 1; }
      out(JSON.stringify({ status: 'ok', posting: p }));
      return 0;
    } catch (e) { err(`${ats}:${board}: ${e.message}`); return 1; }
  }
  if (cmd !== 'scan' || !rest.length) { err('Usage: boards.mjs scan <ats>:<board> ... [--match re] [--where re] [--dry-run] | show <id>'); return 2; }
  for (const r of ['match', 'where']) if (opts[r]) try { new RegExp(opts[r]); } catch { err(`--${r} is not a valid regex`); return 2; }
  const inbox = join(ws, 'inbox.md');
  const known = existsSync(inbox) ? knownIds(readFileSync(inbox, 'utf8')) : new Set();
  const added = [];
  const failed = [];
  let seen = 0;
  for (const [i, spec] of rest.entries()) {
    if (i && pause) await new Promise((r) => setTimeout(r, pause));
    try {
      const all = await scanBoard(spec, fetchImpl, today);
      seen += all.length;
      const fresh = filter(all, opts.match, opts.where).filter((p) => !known.has(p.id));
      for (const p of fresh) known.add(p.id);
      added.push(...fresh);
      err(`${spec}: ${all.length} open, ${fresh.length} new matching, ${fresh.filter((p) => p.checks.length).length} of them with checks`);
    } catch (e) {
      failed.push({ board: spec, error: e.name === 'AbortError' ? 'timeout' : e.message });
      err(`${spec}: failed (${e.name === 'AbortError' ? 'timeout' : e.message})`);
    }
  }
  if (added.length && !opts['dry-run']) {
    if (!existsSync(inbox)) writeFileSync(inbox, '# Inbox\n\nPostings waiting for the evaluate skill. Tick one off once it has a tracker row.\n\n');
    appendFileSync(inbox, `\n## Scan ${today}\n\n${added.map(inboxLine).join('\n')}\n`);
  }
  // The inbox holds every new posting; stdout carries the first SHOW so a broad filter doesn't flood the agent's context.
  const SHOW = 25;
  out(JSON.stringify({ status: failed.length ? 'partial' : 'ok', seen, addedCount: added.length, added: added.slice(0, SHOW).map(({ text, ...p }) => p), more: Math.max(0, added.length - SHOW), failed, dryRun: !!opts['dry-run'] }));
  return failed.length ? 1 : 0;
}

async function selftest() {
  const problems = [];
  const tmp = mkdtempSync(join(tmpdir(), 'trajectory-boards-'));
  const quiet = () => {};
  const outs = [];
  const fixtures = {
    'boards-api.greenhouse.io': { jobs: [
      // updated_at is today on every post, as on large live boards: age must come from first_published.
      { id: 1, title: 'Senior Data Engineer', location: { name: 'Toronto, ON' }, absolute_url: 'https://gh/1', first_published: '2026-09-10T10:00:00-04:00', updated_at: '2026-09-28T01:00:00Z', departments: [{ name: 'Data' }], pay_input_ranges: [{ min_cents: 15000000, max_cents: 18000000, currency_type: 'CAD' }], content: '&lt;p&gt;Build &amp;amp; run pipelines&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Kafka&lt;/li&gt;&lt;/ul&gt;' },
      { id: 2, title: 'Account Executive', location: { name: 'Toronto, ON' }, absolute_url: 'https://gh/2', first_published: '2020-01-01T00:00:00Z', updated_at: '2026-09-28T01:00:00Z', content: '' },
      { id: 3, title: 'Senior  Data Engineer ', location: { name: 'Toronto, ON' }, absolute_url: 'https://gh/3', first_published: '2026-03-01T09:00:00Z', updated_at: '2026-09-28T01:00:00Z', departments: [{ name: 'Data' }], content: '' },
      { id: 4, title: 'Data Engineer', location: { name: 'Berlin' }, absolute_url: 'https://gh/4', first_published: '2026-09-20T09:00:00Z', updated_at: '2026-09-28T01:00:00Z', departments: [{ name: 'Engineering - Pipeline' }], content: 'Join our evergreen talent pool' },
    ] },
    'api.lever.co': [{ id: 'abc', text: 'Data Engineer II - Talent Community', categories: { location: 'Remote - Canada', team: 'Data' }, hostedUrl: 'https://lever/abc', createdAt: 1790000000000, descriptionPlain: 'About', lists: [{ text: 'Requirements', content: '<li>SQL</li>' }], salaryRange: { min: 120000, max: 140000, currency: 'CAD', interval: 'per-year-salary' } }],
    'api.ashbyhq.com': { jobs: [{ id: 'x1', title: 'Data Engineer', location: 'Oslo', isRemote: false, workplaceType: 'Hybrid', jobUrl: 'https://ashby/x1', publishedAt: '2026-09-01', department: 'Engineering', team: 'Data Pipeline', descriptionPlain: 'Norwegian required; the broadest talent pool', isListed: true }, { id: 'x2', title: 'Data Engineer (unlisted)', location: 'Oslo', jobUrl: 'https://ashby/x2', isListed: false }] },
  };
  const fakeFetch = async (url) => {
    const host = new URL(url).host;
    if (url.includes('/missing')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => fixtures[host] };
  };
  const call = (...a) => run([...a, '--workspace', tmp], { fetchImpl: fakeFetch, out: (s) => outs.push(JSON.parse(s)), err: quiet, pause: 0, today: '2026-09-28' });
  try {
    if ((await run(['scan', 'greenhouse:acme'], { cwd: tmp, fetchImpl: fakeFetch, out: quiet, err: quiet })) !== 2) problems.push('no workspace must exit 2');
    writeFileSync(join(tmp, 'trajectory.md'), '# workspace');
    if ((await call('scan', 'greenhouse:acme', 'lever:beta', 'ashby:norrvik', '--match', 'data engineer')) !== 0) problems.push('scan failed');
    const r1 = outs.at(-1);
    if (r1.addedCount !== 5 || r1.seen !== 6 || r1.more !== 0) problems.push(`expected 5 added of 6 listed, got ${r1.addedCount} of ${r1.seen}`);
    const inbox = readFileSync(join(tmp, 'inbox.md'), 'utf8');
    if (!inbox.includes('<!-- lever:beta:abc -->') || !inbox.includes('120000-140000 CAD') || !inbox.includes('150000-180000 CAD')) problems.push('inbox line missing id, Lever salary, or Greenhouse pay range');
    const checks = Object.fromEntries(r1.added.map((p) => [p.id, p.checks.join('; ')]));
    const want = {
      'greenhouse:acme:1': /^same title and location also posted 2026-03-01$/, // fresh; updated_at ignored
      'greenhouse:acme:3': /^posted 211 days ago \(2026-03-01\); same title and location also posted 2026-09-10$/,
      'greenhouse:acme:4': /^listed under the pipeline or evergreen team "Engineering - Pipeline"$/,
      'lever:beta:abc': /^pipeline or evergreen wording in the title$/,
      'ashby:norrvik:x1': /^$/, // a "Data Pipeline" team and "talent pool" in the description are not evergreen
    };
    for (const [id, re] of Object.entries(want)) if (!re.test(checks[id] ?? 'missing')) problems.push(`${id} checks: expected ${re}, got ${JSON.stringify(checks[id])}`);
    if (!inbox.includes('| check: posted 211 days ago')) problems.push('an inbox line must carry its checks');
    const near = freshness([{ title: 'A', location: 'X', posted: '2026-09-01' }, { title: 'A', location: 'X', posted: '2026-09-20' }, { title: 'B', location: 'X', posted: '' }], '2026-09-28');
    if (near.some((p) => p.checks.length) || near[2].ageDays !== null) problems.push('two posts 19 days apart, or one with no date, must carry no checks');
    if (inbox.includes('Account Executive') || inbox.includes('unlisted')) problems.push('filtered or unlisted posting reached the inbox');
    await call('scan', 'greenhouse:acme', '--match', 'data engineer');
    if (outs.at(-1).addedCount !== 0) problems.push('a second scan must not re-add known postings');
    if ((await call('scan', 'greenhouse:missing', 'lever:beta')) !== 1 || outs.at(-1).failed[0]?.error !== 'HTTP 404') problems.push('a failed board must be reported and exit 1, not stop the scan');
    await call('show', 'greenhouse:acme:1');
    const text = outs.at(-1).posting?.text ?? '';
    if (!text.includes('Build & run pipelines') || !text.includes('- Kafka')) problems.push(`show must return decoded plain text, got ${JSON.stringify(text)}`);
    if ((await call('show', 'greenhouse:acme:999')) !== 1) problems.push('a posting no longer on the board must exit 1');
    if ((await call('scan', 'workday:acme')) !== 1 || !outs.at(-1).failed[0]?.error.includes('not <ats>:<board>')) problems.push('an unknown ATS must be reported');
    if ((await call('scan', 'greenhouse:acme', '--match', '(')) !== 2) problems.push('a bad regex must exit 2');
    if (htmlToText('<script>alert(1)</script><p>a</p>') !== 'a') problems.push('script content must be dropped');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  log(`boards --selftest: ${problems.length} problem(s)`);
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
