#!/usr/bin/env node
// Renders a CV or cover letter from Markdown to HTML (one template) and prints it to PDF with a headless Chromium
// browser (Chrome, Edge, or Chromium), using a throwaway browser profile so the user's own profile is never touched.
//
//   node render.mjs <file.md> [--template <html>] [--out <file.pdf>] [--paper letter|a4] [--browser <path>] [--html-only]
//   node render.mjs --selftest
// Default template: ../templates/cv.html. The PDF goes beside the Markdown unless --out says otherwise.
// Markdown subset: # name, ## section, ### entry heading, paragraphs, "- " bullets, **bold**, *italic*, [text](url),
// and a trailing backslash for a line break. Anything else is escaped and shown as text.
// Date ranges are normalised to "Mar 2021 - May 2026" (a plain hyphen): en and em dashes break some ATS date parsers.
// Exit: 0 written, 1 the browser ran but no PDF appeared, 2 couldn't run (no input, no browser found).
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const log = (s = '') => process.stderr.write(s + '\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+)?(?:19|20)\\d\\d`;
const RANGE = new RegExp(`(${DATE})\\s*(?:--|[\\u2013\\u2014]|-)\\s*(${DATE}|[Pp]resent|[Nn]ow|[Cc]urrent)`, 'g');
export const normaliseDates = (s) => s.replace(RANGE, '$1 - $2');

export function inline(s) {
  let out = esc(s);
  out = out.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, t, u) => (/^(https?:|mailto:|tel:)/i.test(u) ? `<a href="${u}">${t}</a>` : t));
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return out;
}

export function markdownToHtml(md) {
  const lines = normaliseDates(md.replace(/\r\n/g, '\n')).split('\n');
  const html = [];
  let para = [];
  let list = false;
  const BR = '\u0000br';
  const flushPara = () => { if (para.length) { html.push(`<p>${para.map(inline).join(' ').replace(/\u0000br ?/g, '<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { html.push('</ul>'); list = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if (h) { flushPara(); closeList(); const n = h[1].length; html.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    if (li) { flushPara(); if (!list) { html.push('<ul>'); list = true; } html.push(`<li>${inline(li[1])}</li>`); continue; }
    closeList();
    para.push(line.endsWith('\\') ? line.slice(0, -1).trimEnd() + BR : line);
  }
  flushPara();
  closeList();
  return html.join('\n');
}

export function fill(template, { title, body, paper }) {
  return template.replaceAll('{{title}}', esc(title)).replaceAll('{{paper}}', paper === 'a4' ? 'A4' : 'letter').replaceAll('{{body}}', body);
}

export function findBrowser(explicit) {
  const candidates = [
    explicit, process.env.TRAJECTORY_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--html-only' || a === '--selftest') opts[a.slice(2)] = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else pos.push(a);
  }
  return { pos, opts };
}

export function run(argv) {
  const { pos, opts } = parseArgs(argv);
  const src = pos[0] && resolve(pos[0]);
  if (!src || !existsSync(src)) { log('Usage: render.mjs <file.md> [--template t.html] [--out f.pdf] [--paper letter|a4] [--browser path] [--html-only]'); return 2; }
  const template = resolve(opts.template ?? join(HERE, '..', 'templates', 'cv.html'));
  if (!existsSync(template)) { log(`No template at ${template}`); return 2; }
  const md = readFileSync(src, 'utf8');
  const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? basename(src, '.md')).replace(/[*_[\]]/g, '');
  const htmlPath = src.replace(/\.md$/i, '') + '.html';
  writeFileSync(htmlPath, fill(readFileSync(template, 'utf8'), { title, body: markdownToHtml(md), paper: opts.paper }));
  if (opts['html-only']) { process.stdout.write(JSON.stringify({ status: 'ok', html: htmlPath }) + '\n'); return 0; }
  const browser = findBrowser(opts.browser);
  if (!browser) { log('No Chrome, Edge, or Chromium found. Install one, or pass --browser <path> (or set TRAJECTORY_BROWSER). The HTML is at ' + htmlPath); return 2; }
  const pdf = resolve(opts.out ?? src.replace(/\.md$/i, '') + '.pdf');
  const profile = mkdtempSync(join(tmpdir(), 'trajectory-render-'));
  try {
    if (existsSync(pdf)) rmSync(pdf);
    const r = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--no-pdf-header-footer', '--print-to-pdf-no-header', `--print-to-pdf=${pdf}`, pathToFileURL(htmlPath).href], { encoding: 'utf8', timeout: 60000 });
    if (!existsSync(pdf) || statSync(pdf).size === 0) { log(`The browser ran (exit ${r.status}) but wrote no PDF.\n${(r.stderr || '').slice(-1500)}`); return 1; }
  } finally {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a locked temp profile is harmless */ }
  }
  log(`Wrote ${pdf}`);
  process.stdout.write(JSON.stringify({ status: 'ok', html: htmlPath, pdf, browser }) + '\n');
  return 0;
}

function selftest() {
  const problems = [];
  const check = (name, got, want) => { if (got !== want) problems.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
  check('en dash range', normaliseDates('Mar 2021 \u2013 May 2026'), 'Mar 2021 - May 2026');
  check('double hyphen to present', normaliseDates('2018--Present'), '2018 - Present');
  check('em dash years', normaliseDates('2018\u20142021'), '2018 - 2021');
  check('a dash that is not a date range stays', normaliseDates('Go \u2013 Python'), 'Go \u2013 Python');
  check('escaping', inline('<script>x</script> & co'), '&lt;script&gt;x&lt;/script&gt; &amp; co');
  check('link', inline('[site](https://a.b/c)'), '<a href="https://a.b/c">site</a>');
  check('javascript link dropped', inline('[x](javascript:alert(1))'), 'x');
  check('bold and italic', inline('**Go** and *Python*'), '<strong>Go</strong> and <em>Python</em>');
  const html = markdownToHtml('# Ada Lovelace\nada@example.com \u00b7 London\\\nlinkedin.com/in/ada\n\n## Experience\n### Engineer, Acme | Mar 2021 \u2013 May 2026\n- Built things\n- Fixed things\n\nTrailing paragraph');
  check('document', html, '<h1>Ada Lovelace</h1>\n<p>ada@example.com \u00b7 London<br>linkedin.com/in/ada</p>\n<h2>Experience</h2>\n<h3>Engineer, Acme | Mar 2021 - May 2026</h3>\n<ul>\n<li>Built things</li>\n<li>Fixed things</li>\n</ul>\n<p>Trailing paragraph</p>');
  const tpl = readFileSync(join(HERE, '..', 'templates', 'cv.html'), 'utf8');
  for (const slot of ['{{title}}', '{{body}}', '{{paper}}']) if (!tpl.includes(slot)) problems.push(`cv.html template lacks ${slot}`);
  if (!fill(tpl, { title: 'A&B', body: '<p>x</p>', paper: 'a4' }).includes('size: A4')) problems.push('paper size not filled');
  log(`render --selftest: ${problems.length} problem(s)`);
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
