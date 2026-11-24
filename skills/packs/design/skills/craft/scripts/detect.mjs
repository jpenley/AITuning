#!/usr/bin/env node
// Checks a rendered page against the craft floor and flags patterns common in AI-made UI. It opens the page in
// headless Chrome (cdp.mjs), runs audit.page.js at a desktop and a mobile width, checks reflow at 640px and 320px
// (a 1280px screen at 200% and 400% zoom: sideways scroll, controls cut off by hidden overflow), and merges the findings.
//
//   node detect.mjs <url|file.html> [--tokens <DESIGN.md|tokens.css>] [--widths 1280,390] [--browser <path>]
//   node detect.mjs <url|file.html> --inventory     what the page uses: colours, families, sizes, radii, with counts
//   node detect.mjs <url|file.html> --stress        also re-measure with longer text (as translation makes it) and right-to-left
//   node detect.mjs --selftest
// Severities: error (breaks the floor: contrast, text under 12px, tap targets, sideways scroll, no focus indicator,
// animation with no reduced-motion path, no html lang, no title), warn (likely wrong: line length, leading, skipped
// headings, layout transitions, long durations, 100vh, off-token colours, fonts, spacing, and radii, a lazy image in the first screen,
// a render-blocking head script, tabindex above 0), tell (a pattern common in AI-made UI; a reason
// to look again, not a ban).
// --tokens reads every colour literal, font family, spacing step, and radius from the file; used values outside it are flagged.
// Exit: 0 no errors, 1 errors found, 2 couldn't run (no browser, page wouldn't open).
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { withPage, toUrl } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const log = (s = '') => process.stderr.write(s + '\n');
const AUDIT = readFileSync(join(HERE, 'audit.page.js'), 'utf8').replace(/^(\s*\/\/.*\n)+/, '');

export function readTokens(src) {
  const colors = [...new Set(src.match(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^()]*\)/gi) || [])];
  const fonts = new Set();
  for (const m of src.matchAll(/font-family\s*:\s*([^;\n}]+)/gi)) fonts.add(m[1].split(',')[0].replace(/["']/g, '').trim());
  // Prose and table rows in a DESIGN.md: "Body font: Source Serif", "| Display typeface | Fraunces |".
  for (const m of src.matchAll(/(?:^|\|)[ \t*-]*[\w -]*?\b(?:font|typeface)s?\b[\w -]*?\**[ \t]*[:|][ \t]*`?([A-Z][\w ]*?\w)`?[ \t]*(?=[,(|;\n]|$)/gim)) fonts.add(m[1].trim());
  // Spacing and radius scales, in px: CSS declarations and custom properties (`--space-4: 16px`, `border-radius: 6px`),
  // DESIGN.md prose ("Spacing scale: 4, 8, 12", "Radii: 4px controls, full for pills") and table rows, whose kind
  // comes from the row or its heading. Bare numbers count only where the value carries no px or rem at all.
  const spacing = new Set(), radii = new Set();
  let section = '';
  for (const line of src.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.*)/);
    if (h) { section = /radi|corner|rounded/i.test(h[1]) ? (/spac/i.test(h[1]) ? '' : 'radius') : /spac/i.test(h[1]) ? 'spacing' : ''; continue; }
    const table = /^\s*\|/.test(line);
    for (const seg of table ? [line] : line.split(/[;{}]/)) {
      if (/(letter|word|border)-spacing/i.test(seg)) continue;
      const kind = /radi(us|i)|rounded|corner/i.test(seg) ? 'radius' : /spac|gap|padding|margin|gutter/i.test(seg) ? 'spacing' : table ? section : '';
      if (!kind) continue;
      const value = table ? seg.split('|').slice(2).join('|') : seg.includes(':') ? seg.slice(seg.indexOf(':') + 1) : '';
      const bare = !/\d(px|rem)\b/i.test(value);
      const into = kind === 'radius' ? radii : spacing;
      for (const m of value.matchAll(/(?<![\w.#-])(\d*\.?\d+)(px|rem)?(?![\w%.])/gi)) if (m[2] || bare) into.add(m[2]?.toLowerCase() === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]));
      if (kind === 'radius' && /\b(full|pill)\b/i.test(value)) radii.add(9999);
    }
  }
  return { colors, fonts: [...fonts].filter((f) => f && !/^(var|inherit|initial|system-ui|sans-serif|serif|monospace)$/i.test(f)), spacing: [...spacing], radii: [...radii] };
}

export async function detect(target, { widths = [1280, 390], tokens = null, browser, inventory = false, stress = false, reflow = true } = {}) {
  const url = toUrl(target);
  const byKey = new Map();
  const sizes = {};
  let inv = null;
  await withPage(async (page) => {
    for (const w of widths) {
      const mobile = w < 600;
      await page.viewport(w, mobile ? 844 : 900, mobile);
      await page.goto(url);
      const r = await page.evaluate(`(${AUDIT})(${JSON.stringify({ mobile, width: w, tokens, inventory: inventory && !inv })})`);
      sizes[w] = r.sizes;
      inv ??= r.inventory;
      const found = [...r.findings];
      if (stress) for (const mode of ['long', 'rtl']) {
        await page.goto(url);
        found.push(...(await page.evaluate(`(${AUDIT})(${JSON.stringify({ mobile, width: w, stress: mode })})`)).findings);
      }
      for (const f of found) {
        const k = `${f.rule}|${f.detail}|${f.where}`;
        if (byKey.has(k)) { const e = byKey.get(k); if (!e.widths.includes(w)) e.widths.push(w); }
        else byKey.set(k, { ...f, widths: [w] });
      }
    }
    // Reflow (WCAG 1.4.10): 640px is a 1280px screen at 200% zoom, 320px one at 400%.
    if (reflow) for (const w of [640, 320]) {
      await page.viewport(w, w < 600 ? 844 : 900, w < 600);
      await page.goto(url);
      for (const f of (await page.evaluate(`(${AUDIT})(${JSON.stringify({ mobile: w < 600, width: w, reflow: true })})`)).findings) byKey.set(`${f.rule}|${f.detail}|${f.where}`, { ...f, widths: [w] });
    }
  }, { browser });
  const order = { error: 0, warn: 1, tell: 2 };
  const findings = [...byKey.values()].sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule));
  const count = (s) => findings.filter((f) => f.severity === s).length;
  return { url, findings, counts: { error: count('error'), warn: count('warn'), tell: count('tell') }, fontSizes: sizes, ...(inventory ? { inventory: inv } : {}) };
}

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selftest' || a === '--inventory' || a === '--stress') opts[a.slice(2)] = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else pos.push(a);
  }
  return { pos, opts };
}

export async function run(argv) {
  const { pos, opts } = parseArgs(argv);
  if (!pos[0]) { log('Usage: detect.mjs <url|file.html> [--tokens DESIGN.md|tokens.css] [--widths 1280,390] [--browser path]'); return 2; }
  let tokens = null;
  if (opts.tokens) {
    try { tokens = readTokens(readFileSync(opts.tokens, 'utf8')); } catch (e) { log(`Couldn't read --tokens: ${e.message}`); return 2; }
    if (!tokens.colors.length && !tokens.fonts.length && !tokens.spacing.length && !tokens.radii.length) log(`warning: no colours, fonts, spacing, or radii found in ${opts.tokens}; drift isn't checked`);
  }
  try {
    const r = await detect(pos[0], { widths: (opts.widths ?? '1280,390').split(',').map(Number), tokens, browser: opts.browser, inventory: !!opts.inventory, stress: !!opts.stress });
    if (opts.inventory) {
      for (const [k, list] of Object.entries(r.inventory)) log(`${k.padEnd(10)} ${list.slice(0, 12).map(([v, n]) => `${v} ×${n}`).join(', ')}${list.length > 12 ? `, … ${list.length} in all` : ''}`);
      process.stdout.write(JSON.stringify({ status: 'ok', url: r.url, inventory: r.inventory }) + '\n');
      return 0;
    }
    for (const f of r.findings) log(`${f.severity.toUpperCase().padEnd(5)} ${f.rule.padEnd(20)} ${f.detail}${f.where ? `  [${f.where}]` : ''}  @${f.widths.join(',')}`);
    log(`${r.counts.error} error(s), ${r.counts.warn} warning(s), ${r.counts.tell} tell(s)`);
    process.stdout.write(JSON.stringify({ status: r.counts.error ? 'errors' : 'ok', ...r }) + '\n');
    return r.counts.error ? 1 : 0;
  } catch (e) {
    log(e.message);
    return 2;
  }
}

// ---------- self-test: a clean page must pass, and every planted fault must be found ----------
const GOOD = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ledgerline</title><style>
:root{--ink:#1d2330;--paper:#fbfaf7;--accent:#0f6b5c;--muted:#4d5566}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 Georgia,serif}
main{max-width:64ch;margin:0 auto;padding:48px 20px}
h1{font-size:40px;line-height:1.15;margin:0 0 16px} h2{font-size:26px;margin:40px 0 12px}
p{margin:0 0 16px} .muted{color:var(--muted)}
a,button{color:var(--accent)} a:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
button{font:inherit;padding:12px 20px;border:2px solid var(--accent);background:transparent;border-radius:6px;transition:background-color .2s ease-out}
button:hover{background:#e6f2ef}
@media (prefers-reduced-motion:reduce){button{transition:none}}
</style><main><h1>Month-end close in two days, not ten</h1>
<p>Ledgerline matches bank lines to invoices as they arrive, so the books are mostly reconciled before the month ends. Your team reviews the exceptions instead of every line, and the audit trail records who approved what.</p>
<p><button>Book a demo</button> <a href="#pricing">See pricing</a> <button disabled style="color:#bbb;background:#eee;border-color:#ddd">Sold out</button></p>
<h2 id="pricing">Pricing</h2><p class="muted">One plan: 40 dollars per user per month, billed monthly, cancel any time.</p></main></html>`;

const BAD = `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title> </title><script src="data:text/javascript,"></script><style>
body{margin:0;font:15px/1.1 Inter,sans-serif;color:#333}
.hero{min-height:100vh;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;padding:40px}
.hero h1{background:linear-gradient(90deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent}
.cta{background:#6366f1;color:#fff;border:0;outline:none;padding:4px 6px;font-size:11px;transition:all 1.2s ease}
.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#999}
.cards{display:flex;gap:16px}.card{width:200px;border-left:4px solid #6366f1;border-radius:12px;padding:16px;background:#fff}
.long{width:1100px;font-size:14px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;animation:pulse 1s infinite}
@keyframes pulse{0%{opacity:1}50%{opacity:.4}}
.wide{width:700px}
.ico{width:16px;height:16px;padding:0;border:0;font-size:12px;background:#eee}
.meta{font-size:13px;color:#555}
</style><div class="hero"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Nova" width="40" height="40" loading="lazy"><p class="eyebrow">Introducing Nova</p><h1>Elevate your workflow</h1>
<p>Unleash seamless productivity — effortlessly — with cutting-edge AI — built for teams — that move fast — and break nothing — ever — again — really.</p>
<button class="cta">Get started</button> <span class="dot"></span> <button class="ico">×</button><button class="ico">+</button></div>
<p class="eyebrow">Features</p><h2>Everything you need</h2>
<div class="cards"><div class="card"><span>🚀</span><h3>Fast</h3><p>Blazing speed.</p></div><div class="card"><span>🔒</span><h3>Secure</h3><p>Bank-grade.</p></div><div class="card"><span>✨</span><h3>Smart</h3><p>AI-powered.</p></div></div>
<p class="eyebrow">Pricing</p><h2>Simple pricing</h2><h4>Pro</h4><p style="color:#aaa">Trusted by John Doe at Acme Corp and thousands more.</p>
<p class="long">This paragraph is deliberately very long and set in a very wide column so that each line runs far past what anyone can read comfortably, with tight leading as well, and it keeps going for quite a while to make sure it wraps across several lines at the desktop width used by the check.</p>
<form><input type="text" name="email" placeholder="Email"><button type="button" class="icon"><svg width="16" height="16"><path d="M0 0h16v16z"/></svg></button></form>
<div onclick="go()">Open settings</div><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="chart">
<p class="meta">May 2026 · 4 min read · Product</p><p class="meta">Apr 2026 · 6 min read · Eng</p><p class="meta">Mar 2026 · 3 min read · Design</p>
<a href="#c" tabindex="3">Changelog</a> <a href="#a">Read the docs →</a> <a href="#b">See pricing →</a>
<p class="eyebrow">FAQ</p><h2>Questions</h2><div class="wide">wide block</div><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40"></html>`;

async function selftest() {
  const problems = [];
  const tmp = mkdtempSync(join(tmpdir(), 'flowstate-detect-test-'));
  try {
    writeFileSync(join(tmp, 'good.html'), GOOD);
    writeFileSync(join(tmp, 'bad.html'), BAD);
    const good = await detect(join(tmp, 'good.html'));
    const loud = good.findings.filter((f) => f.severity !== 'warn');
    if (loud.length) problems.push(`clean page raised: ${loud.map((f) => `${f.rule} (${f.detail})`).join('; ')}`);
    const bad = await detect(join(tmp, 'bad.html'));
    const rules = new Set(bad.findings.map((f) => f.rule));
    for (const r of ['contrast', 'text-size', 'line-length', 'leading', 'headings', 'tap-target', 'overflow', 'focus', 'alt', 'viewport-height', 'layout-transition', 'duration', 'reduced-motion', 'blue-purple-gradient', 'gradient-text', 'accent-border-card', 'pulsing-dot', 'default-indigo', 'emoji-icons', 'identical-cards', 'eyebrows', 'em-dashes', 'buzzwords', 'placeholder-copy', 'zoom-disabled', 'unlabelled-control', 'input-type', 'autocomplete', 'unnamed-control', 'div-button', 'image-size', 'middle-dot-meta', 'arrow-cta', 'html-lang', 'title', 'lazy-above-fold', 'blocking-script', 'positive-tabindex', 'default-font']) {
      if (!rules.has(r)) problems.push(`planted fault not found: ${r}`);
    }
    const tok = readTokens('--ink:#1d2330; --paper:#fbfaf7; --accent: #0f6b5c; --muted:#4d5566;\nfont-family: Georgia, serif;\n| Body font | Source Serif |\n- Spacing scale: 4, 8, 12, 16, 24\n--space-xl: 3rem; letter-spacing: 2px;\n- Radii: 4px controls, 8px cards, full for pills');
    const same = (a, b) => JSON.stringify([...(a || [])].sort((x, y) => x - y)) === JSON.stringify(b);
    if (tok.colors.length !== 4 || !tok.fonts.includes('Georgia') || !tok.fonts.includes('Source Serif') || !same(tok.spacing, [4, 8, 12, 16, 24, 48]) || !same(tok.radii, [4, 8, 9999])) problems.push(`readTokens: ${JSON.stringify(tok)}`);
    // Spacing and radius drift: the clean page's 20px padding and 6px radius are off a scale that lacks them.
    const shape = await detect(join(tmp, 'good.html'), { widths: [1280], tokens: { colors: [], fonts: [], spacing: [0, 4, 8, 12, 16, 24, 32, 40, 48], radii: [4, 8] } });
    const shapeOff = shape.findings.filter((f) => f.rule === 'off-token').map((f) => f.detail);
    if (!shapeOff.some((d) => /spacing 20px .*nearest 16px|spacing 20px .*nearest 24px/.test(d))) problems.push(`off-scale spacing (20px) not flagged with its nearest step: ${JSON.stringify(shapeOff)}`);
    if (!shapeOff.some((d) => /radius 6px .*nearest (4|8)px/.test(d))) problems.push(`off-scale radius (6px) not flagged with its nearest step: ${JSON.stringify(shapeOff)}`);
    const drift = await detect(join(tmp, 'good.html'), { tokens: { colors: ['#1d2330', '#fbfaf7', '#4d5566'], fonts: ['Georgia'] } });
    const off = drift.findings.filter((f) => f.rule === 'off-token');
    if (!off.some((f) => /15, 107, 92|#0f6b5c|rgb\(15, 107, 92\)/.test(f.detail))) problems.push(`the accent missing from the tokens must be flagged: ${JSON.stringify(off.map((f) => f.detail))}`);
    const clean = await detect(join(tmp, 'good.html'), { tokens: readTokens(GOOD) });
    if (clean.findings.some((f) => f.rule === 'off-token')) problems.push(`page matching its own tokens flagged drift: ${clean.findings.filter((f) => f.rule === 'off-token').map((f) => f.detail).join('; ')}`);
    // The other form of the document faults (an empty lang, no <title> at all), and the allowed forms of the rest: head
    // scripts that are async, defer, a module, inline, or JSON data; a lazy image below the first screen; tabindex 0 and -1.
    writeFileSync(join(tmp, 'doc.html'), '<!doctype html><html lang=""><meta name=viewport content="width=device-width"><h1>Report</h1>');
    const doc = new Set((await detect(join(tmp, 'doc.html'), { widths: [1280] })).findings.map((f) => f.rule));
    for (const r of ['html-lang', 'title']) if (!doc.has(r)) problems.push(`planted fault not found: ${r} (empty lang / no title)`);
    const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    writeFileSync(join(tmp, 'allowed.html'), `<!doctype html><html lang="en"><meta name=viewport content="width=device-width"><title>Report</title>
<script async src="data:text/javascript,"></script><script defer src="data:text/javascript,"></script><script type="module" src="data:text/javascript,"></script><script src="data:application/json,{}" type="application/ld+json"></script><script>void 0</script>
<h1>Report</h1><img src="${GIF}" alt="" width="40" height="40"><div style="height:3000px"></div><img src="${GIF}" alt="" width="40" height="40" loading="lazy">
<div tabindex="0">Focusable</div><div tabindex="-1">Script focus</div>`);
    const allowed = (await detect(join(tmp, 'allowed.html'))).findings.filter((f) => ['html-lang', 'title', 'lazy-above-fold', 'blocking-script', 'positive-tabindex'].includes(f.rule));
    if (allowed.length) problems.push(`allowed forms flagged: ${allowed.map((f) => `${f.rule} (${f.detail})`).join('; ')}`);
    // Newer template tells: everything centred, one radius and shadow on every block, 01/02/03 markers, Space Grotesk.
    writeFileSync(join(tmp, 'tells.html'), `<!doctype html><html lang="en"><meta name=viewport content="width=device-width"><title>Pressmark</title><style>
body{margin:0;padding:24px;text-align:center;font:17px/1.6 "Space Grotesk",sans-serif;color:#2b2420;background:#f6f0e4} .block{border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:24px;margin:16px 0;background:#fffaf1}</style>
<h1>Your zine, printed and posted</h1><p>Upload a PDF and we print and post each copy as orders come in.</p>
<div class="block"><span>01</span><h3>Riso and digital</h3><p>Two-colour riso for short runs.</p></div><div class="block"><span>02</span><h3>Recycled stock</h3><p>At least 80% recycled.</p></div>
<div class="block"><span>03</span><h3>Your shop, our post</h3><p>We ship under your name.</p></div><div class="block"><h2>Ready to print?</h2></div></html>`);
    const t2 = new Set((await detect(join(tmp, 'tells.html'), { widths: [1280], reflow: false })).findings.map((f) => f.rule));
    for (const r of ['all-centred', 'uniform-blocks', 'numbered-markers', 'default-font']) if (!t2.has(r)) problems.push(`planted tell not found: ${r}`);
    // Reflow: a table with a min-width that fits at 390px but not 320px, and a one-line nav that hides its overflow and
    // only collapses below 600px, so its last links are cut off at 640px (200% zoom). Neither shows at 1280 or 390.
    writeFileSync(join(tmp, 'reflow.html'), `<!doctype html><html lang="en"><meta name=viewport content="width=device-width"><title>Plans</title><style>
*{box-sizing:border-box} body{margin:0;font:16px sans-serif} .top{display:flex;gap:24px;padding:0 24px;height:64px;align-items:center;overflow:hidden;white-space:nowrap}
.nav{display:flex;gap:8px} .nav a{padding:10px 14px} main{padding:16px} table{min-width:340px;width:100%}
@media (max-width:599px){.nav{display:none}}</style><header class="top"><a href="/">Tallyroom</a><nav class="nav"><a href="/a">Dashboard</a><a href="/b">Invoices</a><a href="/c">Clients</a><a href="/d">Reports</a><a href="/e">Team</a><a href="/f">Plans and billing</a><a href="/g">Settings</a><a href="/h">Sign out</a></nav></header>
<main><h1>Plans</h1><table><tr><th>Feature</th><th>Solo</th><th>Studio</th><th>Agency</th></tr></table></main></html>`);
    const rf = (await detect(join(tmp, 'reflow.html'))).findings.filter((f) => f.rule === 'reflow');
    if (!rf.some((f) => f.widths.includes(320) && /scrolls sideways/.test(f.detail))) problems.push(`reflow: sideways scroll at 320px not reported: ${JSON.stringify(rf)}`);
    if (!rf.some((f) => f.widths.includes(640) && /cut off/.test(f.detail))) problems.push(`reflow: nav links clipped at 640px (200% zoom) not reported: ${JSON.stringify(rf)}`);
    if (rf.some((f) => f.widths.includes(1280) || f.widths.includes(390))) problems.push(`reflow findings must come only from the 640 and 320 passes: ${JSON.stringify(rf)}`);
    // Stress: a fixed-width, no-wrap, clipped button breaks with longer text; the clean page must survive it.
    writeFileSync(join(tmp, 'tight.html'), '<!doctype html><meta name=viewport content="width=device-width"><style>body{font:16px sans-serif;margin:0} .b{width:120px;white-space:nowrap;overflow:hidden;display:inline-block}</style><h1>Title</h1><span class="b">Save changes</span>');
    const st = await detect(join(tmp, 'tight.html'), { stress: true, widths: [390] });
    if (!st.findings.some((f) => f.rule === 'stress-clipped')) problems.push(`stress: the clipped fixed-width label was not reported: ${JSON.stringify(st.findings.map((f) => f.rule))}`);
    const gs = await detect(join(tmp, 'good.html'), { stress: true });
    const gsx = gs.findings.filter((f) => f.rule.startsWith('stress-'));
    if (gsx.length) problems.push(`stress: the clean page broke under longer text or RTL: ${gsx.map((f) => f.rule + ' ' + f.where).join('; ')}`);
    const invr = await detect(join(tmp, 'good.html'), { inventory: true, widths: [1280] });
    if (!invr.inventory?.text.some(([v]) => v === '#1d2330') || !invr.inventory.family.some(([v]) => v === 'Georgia') || !invr.inventory.size.some(([v]) => v === '40px')) problems.push(`inventory missing known values: ${JSON.stringify(invr.inventory).slice(0, 300)}`);
    if ((await run([join(tmp, 'missing.html')])) !== 2) problems.push('a missing page must exit 2');
  } catch (e) {
    problems.push(e.code === 'NO_BROWSER' ? 'no browser found: the self-test needs Chrome, Edge, or Chromium' : e.stack);
  } finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  log(`detect --selftest: ${problems.length} problem(s)`);
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
