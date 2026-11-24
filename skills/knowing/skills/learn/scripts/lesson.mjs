#!/usr/bin/env node
// Renders a lesson written in Markdown into one self-contained, interactive HTML page: explanations, worked
// examples, hints, and questions the learner answers before seeing the explanation. No external assets.
//
//   node lesson.mjs <lesson.md> [--out <lesson.html>]
//   node lesson.mjs --selftest
//
// Lesson format (Markdown subset: # title, ## sections, paragraphs, - lists, **bold**, *italic*, `code`,
// [links](url), fenced code blocks), plus three kinds of block, each opened by a line ":::kind" and closed by ":::":
//
//   :::example            a worked example, shown in a panel
//   :::hint               collapsed until the learner opens it
//   :::question           a question; inside it:
//     - [ ] wrong option    multiple choice: mark the right option(s) with [x]
//     - [x] right option
//     = accepted answer     short answer instead: one accepted answer per "=" line (case and spaces ignored)
//     > explanation         shown after the learner checks their answer
//
// Exit: 0 written, 1 the lesson has a problem (a question with no right answer, an unclosed block), 2 couldn't run.
import { existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = (s = '') => process.stderr.write(s + '\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inline(s) {
  const codes = [];
  let out = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  out = esc(out);
  out = out.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, t, u) => (/^(https?:|mailto:)/i.test(u) ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : t));
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

// Markdown subset to HTML for a run of lines (no ::: blocks inside).
export function blocks(lines) {
  const html = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)\s*$/);
    if (fence) {
      flushPara(); closeList();
      const body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) body.push(lines[i]);
      html.push(`<pre><code${fence[2] ? ` class="lang-${esc(fence[2])}"` : ''}>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flushPara(); closeList(); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flushPara(); closeList(); const n = Math.max(2, h[1].length); html.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) { closeList(); html.push(`<${kind}>`); list = kind; }
      html.push(`<li>${inline((ul ?? ol)[1])}</li>`);
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara(); closeList();
  return html.join('\n');
}

export function parse(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const problems = [];
  let title = 'Lesson';
  const parts = [];
  let buf = [];
  let q = 0;
  const flush = () => { if (buf.length) { parts.push({ kind: 'md', lines: buf }); buf = []; } };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].match(/^#\s+(.*)$/);
    if (t && title === 'Lesson' && !parts.length && !buf.some((l) => l.trim())) { title = t[1].trim(); continue; }
    const open = lines[i].match(/^:::(example|hint|question)\s*$/);
    if (!open) { buf.push(lines[i]); continue; }
    flush();
    const body = [];
    let closed = false;
    for (i++; i < lines.length; i++) { if (/^:::\s*$/.test(lines[i])) { closed = true; break; } body.push(lines[i]); }
    if (!closed) problems.push(`:::${open[1]} opened but never closed`);
    if (open[1] !== 'question') { parts.push({ kind: open[1], lines: body }); continue; }
    q++;
    const options = [], accept = [], why = [], text = [];
    for (const l of body) {
      const opt = l.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
      if (opt) options.push({ text: opt[2], right: opt[1] !== ' ' });
      else if (/^\s*=\s*/.test(l)) accept.push(l.replace(/^\s*=\s*/, '').trim());
      else if (/^\s*>\s?/.test(l)) why.push(l.replace(/^\s*>\s?/, ''));
      else text.push(l);
    }
    if (options.length && !options.some((o) => o.right)) problems.push(`question ${q} has options but none marked [x]`);
    if (!options.length && !accept.length) problems.push(`question ${q} has no options and no "=" answers`);
    if (!why.length) problems.push(`question ${q} has no "> explanation"`);
    parts.push({ kind: 'question', n: q, text, options, accept, why });
  }
  flush();
  return { title, parts, problems };
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function render({ title, parts }) {
  const body = parts.map((p) => {
    if (p.kind === 'md') return blocks(p.lines);
    if (p.kind === 'example') return `<section class="example"><div class="tag">Worked example</div>\n${blocks(p.lines)}\n</section>`;
    if (p.kind === 'hint') return `<details class="hint"><summary>Hint</summary>\n${blocks(p.lines)}\n</details>`;
    const id = `q${p.n}`;
    const answer = p.options.length
      ? `<fieldset>${p.options.map((o, i) => `<label><input type="${p.options.filter((x) => x.right).length > 1 ? 'checkbox' : 'radio'}" name="${id}" value="${i}"> ${inline(o.text)}</label>`).join('\n')}</fieldset>`
      : `<input class="short" type="text" aria-label="Your answer" autocomplete="off">`;
    const key = p.options.length ? p.options.map((o, i) => (o.right ? i : null)).filter((x) => x !== null).join(',') : p.accept.map(norm).join('\u0001');
    return `<section class="question" id="${id}" data-kind="${p.options.length ? 'choice' : 'short'}" data-key="${esc(Buffer.from(key).toString('base64'))}">
<div class="tag">Question ${p.n}</div>
${blocks(p.text)}
${answer}
<div class="row"><button type="button" class="check">Check</button><span class="result" role="status" aria-live="polite"></span></div>
<div class="why" hidden>${blocks(p.why)}</div>
</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --ink:#1c2230; --muted:#4a5366; --paper:#fbfaf7; --panel:#f1efe8; --accent:#1f5f8b; --ok:#1b6b3a; --no:#9b2c2c; --line:#d8d3c7; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:18px/1.6 Georgia, "Times New Roman", serif; }
  main { max-width:44rem; margin:0 auto; padding:2.5rem 1.25rem 4rem; }
  h1 { font-size:2rem; line-height:1.2; margin:0 0 1.5rem; }
  h2 { font-size:1.35rem; margin:2.25rem 0 .75rem; } h3 { font-size:1.1rem; margin:1.5rem 0 .5rem; }
  code { font:0.9em ui-monospace, Consolas, monospace; background:var(--panel); padding:.1em .3em; border-radius:4px; }
  pre { background:#1d2433; color:#eef1f6; padding:1rem; border-radius:8px; overflow-x:auto; line-height:1.45; }
  pre code { background:none; padding:0; color:inherit; font-size:.85rem; }
  a { color:var(--accent); }
  .example, .question { border:1px solid var(--line); border-radius:10px; padding:1rem 1.25rem; margin:1.5rem 0; background:#fff; }
  .example { background:var(--panel); }
  .tag { font:600 .8rem system-ui, sans-serif; letter-spacing:.04em; color:var(--muted); text-transform:uppercase; margin-bottom:.25rem; }
  fieldset { border:0; padding:0; margin:.5rem 0; }
  label { display:block; padding:.4rem .5rem; border-radius:6px; cursor:pointer; }
  label:hover { background:var(--panel); }
  input.short { font:inherit; padding:.4rem .6rem; border:1px solid var(--line); border-radius:6px; width:min(100%, 22rem); }
  .row { display:flex; gap:1rem; align-items:center; margin-top:.5rem; flex-wrap:wrap; }
  button { font:600 1rem system-ui, sans-serif; padding:.55rem 1.1rem; border-radius:6px; border:2px solid var(--accent); background:var(--accent); color:#fff; cursor:pointer; min-height:44px; }
  button:focus-visible, input:focus-visible, summary:focus-visible, a:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
  .result { font:600 1rem system-ui, sans-serif; }
  .result.ok { color:var(--ok); } .result.no { color:var(--no); }
  .why { border-top:1px solid var(--line); margin-top:.75rem; padding-top:.5rem; }
  details.hint { margin:1rem 0; } details.hint summary { cursor:pointer; color:var(--accent); font-weight:600; }
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
</style>
</head>
<body>
<main>
<h1>${inline(title)}</h1>
${body}
</main>
<script>
  const norm = (s) => s.toLowerCase().replace(/\\s+/g, ' ').trim();
  for (const q of document.querySelectorAll('.question')) {
    const key = atob(q.dataset.key);
    const out = q.querySelector('.result');
    q.querySelector('.check').addEventListener('click', () => {
      let right;
      if (q.dataset.kind === 'choice') {
        const picked = [...q.querySelectorAll('input:checked')].map((i) => i.value).sort().join(',');
        if (!picked) { out.textContent = 'Pick an answer first.'; out.className = 'result'; return; }
        right = picked === key.split(',').sort().join(',');
      } else {
        const v = norm(q.querySelector('input.short').value);
        if (!v) { out.textContent = 'Type an answer first.'; out.className = 'result'; return; }
        right = key.split('\\u0001').includes(v);
      }
      out.textContent = right ? 'Right.' : 'Not quite. Read why, then try the next one.';
      out.className = 'result ' + (right ? 'ok' : 'no');
      q.querySelector('.why').hidden = false;
    });
  }
</script>
</body>
</html>
`;
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

export function run(argv) {
  const { pos, opts } = parseArgs(argv);
  const src = pos[0] && resolve(pos[0]);
  if (!src || !existsSync(src)) { log('Usage: lesson.mjs <lesson.md> [--out lesson.html]'); return 2; }
  const lesson = parse(readFileSync(src, 'utf8'));
  for (const p of lesson.problems) log(`problem: ${p}`);
  if (lesson.problems.length) { process.stdout.write(JSON.stringify({ status: 'problems', problems: lesson.problems }) + '\n'); return 1; }
  const out = resolve(opts.out ?? src.replace(/\.md$/i, '') + '.html');
  writeFileSync(out, render(lesson));
  const questions = lesson.parts.filter((p) => p.kind === 'question').length;
  log(`Wrote ${out} (${questions} question(s))`);
  process.stdout.write(JSON.stringify({ status: 'ok', html: out, title: lesson.title, questions }) + '\n');
  return 0;
}

function selftest() {
  const problems = [];
  const md = `# Ownership in Rust

Every value has **one** owner. Coming from Python, think of \`s\` as the *only* name allowed to free it.

:::example
\`\`\`rust
let s = String::from("hi");
let t = s; // s moves into t
\`\`\`
:::

:::question
After \`let t = s;\`, what happens if you use \`s\`?
- [ ] It prints "hi"
- [x] The compiler rejects it: \`s\` was moved
- [ ] It prints an empty string
> A move transfers ownership; the old name can't be used again.
:::

:::question
Which keyword makes a binding changeable?
= mut
= let mut
> Bindings are immutable by default; \`mut\` opts in.
:::

:::hint
Look at who owns the value after the move.
:::
`;
  const l = parse(md);
  if (l.problems.length) problems.push(`valid lesson reported problems: ${l.problems.join('; ')}`);
  if (l.title !== 'Ownership in Rust') problems.push(`title: ${l.title}`);
  const html = render(l);
  if ((html.match(/class="question"/g) || []).length !== 2) problems.push('expected two questions');
  if (!html.includes('type="radio"') || !html.includes('class="short"')) problems.push('choice and short-answer inputs missing');
  if (html.includes('The compiler rejects it: <code>s</code> was moved</label>') === false) problems.push('option text not rendered with inline code');
  if (/>\s*mut\s*</.test(html.split('<script>')[0].replace(/<pre>[\s\S]*?<\/pre>/g, '').split('Which keyword')[1]?.split('class="why"')[0] ?? '')) problems.push('short answer visible in the page before checking');
  const q2 = html.match(/id="q2"[^>]*data-key="([^"]+)"/)?.[1];
  if (!q2 || Buffer.from(q2, 'base64').toString() !== 'mut\u0001let mut') problems.push(`short-answer key wrong: ${q2}`);
  const q1 = html.match(/id="q1"[^>]*data-key="([^"]+)"/)?.[1];
  if (!q1 || Buffer.from(q1, 'base64').toString() !== '1') problems.push('choice key should be option 1');
  if (!html.includes('<div class="why" hidden>')) problems.push('explanations must start hidden');
  if (!html.includes('let t = s; // s moves into t')) problems.push('code block content missing');
  if (html.includes('<script src') || html.includes('<link ')) problems.push('page must be self-contained');
  const bad = parse(':::question\nPick one\n- [ ] a\n- [ ] b\n:::\n\n:::hint\nunclosed');
  if (!bad.problems.some((p) => /none marked/.test(p)) || !bad.problems.some((p) => /never closed/.test(p)) || !bad.problems.some((p) => /no "> explanation"/.test(p))) problems.push(`bad lesson problems not all reported: ${bad.problems.join('; ')}`);
  if (inline('<b>&') !== '&lt;b&gt;&amp;') problems.push('HTML not escaped');
  if (inline('[x](javascript:alert(1))') !== 'x') problems.push('javascript link not dropped');
  log(`lesson --selftest: ${problems.length} problem(s)`);
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
