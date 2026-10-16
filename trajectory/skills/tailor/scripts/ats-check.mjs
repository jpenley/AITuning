#!/usr/bin/env node
// Reads a CV PDF back the way an applicant tracking system does, through its text layer in content-stream order
// (pdftotext -raw, from Poppler),
// and checks what the parser would actually see.
//
//   node ats-check.mjs <cv.pdf> [--keywords "a,b,c" | --keywords-file <file>] [--sections "Experience,Education"]
//                      [--max-pages 2]
//   node ats-check.mjs --selftest
// Checks: a text layer exists; no unmapped glyphs ("(cid:N)", U+FFFD, private-use characters) or ligatures; an email
// address and a phone number are present as text; date ranges use a plain hyphen and have both ends; the page count;
// the named sections appear, in that order; and each keyword appears (covered) or doesn't (missing). Keywords are
// reported, never judged: whether a missing one is a true gap is the tailor skill's call.
// Exit: 0 no errors (warnings allowed), 1 errors found, 2 couldn't run (no file, no pdftotext).
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const log = (s = '') => process.stderr.write(s + '\n');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+)?(?:19|20)\\d\\d`;

export function checkText(text, { keywords = [], sections = [], maxPages = 2 } = {}) {
  const findings = [];
  const add = (severity, check, detail) => findings.push({ severity, check, detail });
  const body = text.replace(/\f/g, '\n');
  if (body.replace(/\s/g, '').length < 200) add('error', 'text-layer', 'Little or no extractable text: the PDF may be an image, so an ATS reads nothing.');

  const garbage = [...new Set(body.match(/\(cid:\d+\)|�|[-]/g) ?? [])];
  if (garbage.length) add('error', 'glyphs', `Characters the parser can't map: ${garbage.slice(0, 5).join(' ')}. Use a standard font.`);
  const ligatures = [...new Set(body.match(/[ﬀ-ﬆ]/g) ?? [])];
  if (ligatures.length) add('warning', 'ligatures', `Ligature characters (${ligatures.join(' ')}) can split words for keyword matching.`);

  if (!/[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(body)) add('error', 'contact', 'No email address in the text layer.');
  if (!/(\+?\d[\d\s().-]{7,}\d)/.test(body)) add('warning', 'contact', 'No phone number in the text layer.');

  const dashRanges = body.match(new RegExp(`${DATE}\\s*(?:--|[\\u2013\\u2014])\\s*(?:${DATE}|[Pp]resent|[Cc]urrent|[Nn]ow)`, 'g')) ?? [];
  if (dashRanges.length) add('warning', 'dates', `Date ranges with an en/em dash or "--" (some parsers drop them): ${dashRanges.slice(0, 3).join('; ')}`);
  const openEnded = body.match(new RegExp(`${DATE}\\s*(?:-|\\u2013|\\u2014|to)\\s*$`, 'gm')) ?? [];
  if (openEnded.length) add('warning', 'dates', `Date ranges with no end: ${openEnded.slice(0, 3).map((s) => s.trim()).join('; ')}. Write "Present" for a current role.`);

  const pages = (text.match(/\f/g) ?? []).length || 1;
  if (pages > maxPages) add('warning', 'length', `${pages} pages; the target is ${maxPages}.`);

  let last = -1;
  for (const s of sections) {
    const i = body.search(new RegExp(`^\\s*${escRe(s)}\\s*$`, 'im'));
    if (i < 0) add('error', 'sections', `Section "${s}" not found as its own line.`);
    else if (i < last) add('warning', 'sections', `Section "${s}" is read out of order: check the layout's reading order.`);
    else last = i;
  }

  const covered = [];
  const missing = [];
  for (const k of keywords.map((x) => x.trim()).filter(Boolean)) {
    const re = new RegExp(`(^|[^\\w])${escRe(k)}(?![\\w])`, 'i');
    (re.test(body) ? covered : missing).push(k);
  }
  return { pages, chars: body.length, findings, keywords: { covered, missing } };
}

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selftest') opts.selftest = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else pos.push(a);
  }
  return { pos, opts };
}

export function run(argv) {
  const { pos, opts } = parseArgs(argv);
  const pdf = pos[0] && resolve(pos[0]);
  if (!pdf || !existsSync(pdf)) { log('Usage: ats-check.mjs <cv.pdf> [--keywords "a,b"] [--keywords-file f] [--sections "Experience,Education"] [--max-pages 2]'); return 2; }
  const r = spawnSync('pdftotext', ['-enc', 'UTF-8', '-raw', pdf, '-'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    log(r.error ? 'pdftotext not found. Install Poppler (Windows: it ships with Git for Windows under mingw64/bin, or `winget install oschwartz10612.Poppler`; macOS: `brew install poppler`; Linux: poppler-utils).' : `pdftotext failed: ${r.stderr}`);
    return 2;
  }
  const keywords = opts['keywords-file'] ? readFileSync(opts['keywords-file'], 'utf8').split(/\r?\n|,/) : (opts.keywords ?? '').split(',');
  const sections = (opts.sections ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const res = checkText(r.stdout.replace(/\r/g, ''), { keywords, sections, maxPages: Number(opts['max-pages'] ?? 2) });
  for (const f of res.findings) log(`${f.severity.toUpperCase().padEnd(7)} ${f.check}: ${f.detail}`);
  if (keywords.some((k) => k.trim())) log(`keywords: ${res.keywords.covered.length} covered, missing: ${res.keywords.missing.join(', ') || 'none'}`);
  const errors = res.findings.filter((f) => f.severity === 'error').length;
  process.stdout.write(JSON.stringify({ status: errors ? 'errors' : 'ok', pdf, ...res }) + '\n');
  return errors ? 1 : 0;
}

function selftest() {
  const problems = [];
  const good = `Ada Lovelace\nada@example.com | +44 20 7946 0000 | London\n\nExperience\nEngineer, Acme | Mar 2021 - Present\n- Built data pipelines in Python and SQL with Apache Kafka and C++ tooling on .NET services, for many customers across the platform over several years of work.\n\nEducation\nBSc Mathematics | 2014 - 2018\n\f`;
  const r = checkText(good, { keywords: ['Python', 'kafka', 'C++', '.NET', 'Terraform', 'SQL'], sections: ['Experience', 'Education'] });
  if (r.findings.length) problems.push(`a clean CV raised findings: ${JSON.stringify(r.findings)}`);
  if (r.keywords.missing.join() !== 'Terraform' || r.keywords.covered.length !== 5) problems.push(`keyword split wrong: ${JSON.stringify(r.keywords)}`);
  if (!checkText('x'.repeat(50)).findings.some((f) => f.check === 'text-layer')) problems.push('an empty text layer must be an error');
  if (!checkText(good + '(cid:12) ').findings.some((f) => f.check === 'glyphs' && f.severity === 'error')) problems.push('unmapped glyphs must be an error');
  if (!checkText(good.replace('ada@example.com', 'ada at example')).findings.some((f) => f.check === 'contact' && f.severity === 'error')) problems.push('a missing email must be an error');
  if (!checkText(good.replace('Mar 2021 - Present', 'Mar 2021 – May 2026')).findings.some((f) => f.check === 'dates')) problems.push('an en-dash date range must warn');
  if (!checkText(good.replace('2014 - 2018', '2014 -')).findings.some((f) => f.check === 'dates' && f.detail.includes('no end'))) problems.push('an open-ended range must warn');
  if (!checkText(good, { sections: ['Education', 'Experience'] }).findings.some((f) => f.detail.includes('out of order'))) problems.push('sections out of order must warn');
  if (!checkText(good + 'more\fmore\f', { maxPages: 2 }).findings.some((f) => f.check === 'length')) problems.push('three pages over a two-page limit must warn');
  if (checkText(good, { keywords: ['Java'] }).keywords.missing[0] !== 'Java') problems.push('"Java" must not match inside "JavaScript"-free text');
  if (checkText('uses JavaScript daily ' + good, { keywords: ['Java'] }).keywords.covered.length) problems.push('"Java" must not match inside "JavaScript"');
  log(`ats-check --selftest: ${problems.length} problem(s)`);
  for (const p of problems) log(`  - ${p}`);
  process.stdout.write(JSON.stringify({ status: problems.length ? 'fail' : 'ok', problems }) + '\n');
  process.exit(problems.length ? 1 : 0);
}

// Real paths on both sides: run through a symlink or junction (how Codex and opencode install skills), argv[1]
// keeps the link path while import.meta.url is the real one.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  if (process.argv.includes('--selftest')) selftest();
  else process.exit(run(process.argv.slice(2)));
}
