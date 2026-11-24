#!/usr/bin/env node
// Checks a Mermaid diagram before it is handed over: does it parse and render (the Mermaid CLI, `mmdc`, is the gate),
// does every `%% src: path:line` comment point at a real line of a real file, and does it hold the mistakes Mermaid
// accepts without complaint (a node id one character off another id, which silently makes a second node; a sequence
// message to a participant that was never declared). Mermaid ignores a `%%` comment on its own line (one after a
// statement does not parse), so the evidence lives inside the
// diagram without changing how it draws. Nothing is installed; mmdc is found, not fetched. No packages.
//
//   node diagram-check.mjs <file.mmd | file.md> [--root <dir>] [--out <image.svg|png|pdf>] [--require-src]
//                          [--no-render] [-- <extra mmdc arguments, for example -p puppeteer.json -s 2>]
//   node diagram-check.mjs --selftest
// A .md file has each ```mermaid block checked; any other file is one diagram. --root is the folder `%% src:` paths
// are relative to (default: the current folder). --out keeps the rendered image (several blocks: name-1.png, ...).
// --require-src requires a quoted source for each statement, except visibly unverified elements (real-code mode).
// --no-render runs only the static checks, when mermaid-cli is not installed; say so in the report.
// Finding mmdc: $MMDC (a file; a .js/.mjs/.cjs runs with node), else node_modules/@mermaid-js/mermaid-cli from the
// current folder upward, else `mmdc` on PATH. Install: npm install @mermaid-js/mermaid-cli (Node 22.13 or later; it
// downloads a headless Chrome for puppeteer).
// Output: JSON on stdout: { status, root, renderer, blocks: [{ index, line, type, verdict, findings, sources, image }] }.
//   verdict: ok, findings, invalid (mmdc rejected it). A finding: { kind, line, detail }, `line` a line of the input file.
//   kind: invalid, possible-typo, undeclared-participant, trailing-comment, missing-file, outside-root, out-of-range,
//   bad-range, blank-line, quote-mismatch, missing-quote, malformed-src, no-src, missing-src. A citation may carry a short quote from the line it points at,
//   `%% src: src/a.ts:12 "reserve(items)"`, which must appear on those lines or within two of them (else the finding
//   says where it is): a line number alone only proves the line exists. `sources`: { checked, resolved, statements, cited, unverified }: how many `%% src:` citations
//   were found and resolve, how many statements have a `%% src:` line just above, and how many are visibly unverified.
// Exit: 0 clean, 1 findings (including an invalid diagram), 2 couldn't run (no input, no diagram in it, no mmdc
// unless --no-render). Never read 2 as clean.
import { readFileSync, writeFileSync, statSync, realpathSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, relative, join, dirname, isAbsolute, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const log = (s = '') => process.stderr.write(s + '\n');
const RENDER_TIMEOUT_MS = 180000;
const MERMAID_CLI = ['node_modules', '@mermaid-js', 'mermaid-cli'];

// ---------- reading the input ----------

// The diagrams in a file: each ```mermaid (or ~~~mermaid) block of a Markdown file, or the whole file otherwise.
export function extractBlocks(text, file = '') {
  const lines = text.split(/\r?\n/);
  if (!/\.(md|markdown|mdx)$/i.test(file)) return [{ index: 1, line: 1, text: lines.join('\n') }];
  const blocks = [];
  let open = null;
  lines.forEach((l, i) => {
    if (!open) {
      const m = l.match(/^\s*(```+|~~~+)\s*mermaid\b/i);
      if (m) open = { fence: m[1], line: i + 2, body: [] };
      return;
    }
    if (new RegExp(`^\\s*${open.fence[0]}{${open.fence.length},}\\s*$`).test(l)) { blocks.push({ index: blocks.length + 1, line: open.line, text: open.body.join('\n') }); open = null; return; }
    open.body.push(l);
  });
  return blocks;
}

// The diagram type: the first line that is not blank, a comment, a directive or frontmatter.
export function diagramType(text) {
  const lines = text.split(/\r?\n/);
  let i = 0;
  if (lines[0]?.trim() === '---') { i = lines.findIndex((l, k) => k > 0 && l.trim() === '---') + 1; if (i === 0) i = lines.length; }
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('%%')) continue;
    const w = t.match(/^[A-Za-z][\w-]*/)?.[0] ?? '';
    return /^(flowchart|graph)$/i.test(w) ? 'flowchart' : w;
  }
  return '';
}

// ---------- static checks ----------

// Edit distance where swapping two neighbouring letters (Cahce for Cache) counts as one edit.
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
};

// An id that looks like a slip for a declared one: same letters in another case, or one edit apart (ids of 4+ letters).
function slipFor(id, declared) {
  for (const d of declared) {
    if (d === id) continue;
    if (d.toLowerCase() === id.toLowerCase() && id.length >= 2) return d;
    if (id.length >= 4 && d.length >= 4 && lev(id, d) === 1) return d;
    // The same three or more letters in another order (Pya for Pay) is a slip even in a short id.
    if (id.length >= 3 && id.length === d.length && [...id.toLowerCase()].sort().join('') === [...d.toLowerCase()].sort().join('')) return d;
  }
  return null;
}

// A node or participant id: letters, digits and underscores, with hyphens only between them (so "API-->B" ends at API).
const ID = '[A-Za-z_]\\w*(?:-\\w+)*';
const SKIP_LINE =/^\s*(?:%%|subgraph\b|end\b|direction\b|classDef\b|class\b|style\b|linkStyle\b|click\b|accTitle\b|accDescr\b|title\b)/i;
const ARROW = /<?(?:-{2,}|={2,}|-\.+-)[>xo]?/;

// Flowchart: ids used as edge endpoints but never given a label or shape, when one of them is a slip for a declared id.
export function flowchartFindings(text) {
  const declared = new Set();
  const used = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (SKIP_LINE.test(raw)) return;
    let l = raw.replace(/%%.*$/, '').replace(/"[^"]*"/g, '§').replace(/:::[\w-]+/g, '');
    // Replace each label with a marker so an id followed by one counts as declared and label text is not read as ids.
    l = l.replace(/\[\[[^\]]*\]\]|\[\([^)]*\)\]|\[\/[^\]]*\/\]|\[\\[^\]]*\\\]|\[[^\]]*\]|\(\(\([^)]*\)\)\)|\(\([^)]*\)\)|\(\[[^\]]*\]\)|\([^)]*\)|\{\{[^}]*\}\}|\{[^}]*\}|>[^\]]*\]/g, '§');
    l = l.replace(/\|[^|]*\|/g, ' ');
    if (!ARROW.test(l) && !new RegExp(`${ID}§`).test(l)) return;
    for (const part of l.split(new RegExp(ARROW.source, 'g')).flatMap((p) => p.split('&'))) {
      const m = part.trim().match(new RegExp(`^(${ID})(§)?`));
      if (!m) continue;
      if (m[2]) declared.add(m[1]);
      used.push({ id: m[1], line: i + 1 });
    }
  });
  const out = [];
  const seen = new Set();
  for (const u of used) {
    if (declared.has(u.id) || seen.has(u.id)) continue;
    const d = slipFor(u.id, declared);
    if (d) { seen.add(u.id); out.push({ kind: 'possible-typo', line: u.line, detail: `\`${u.id}\` is never declared and looks like \`${d}\`: Mermaid draws it as a second node` }); }
  }
  return out;
}

// Sequence diagram: with participants declared, a message endpoint that was not declared is probably a slip.
export function sequenceFindings(text) {
  const declared = new Set();
  const ends = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const l = raw.replace(/%%.*$/, '');
    const p = l.match(new RegExp(`^\\s*(?:create\\s+)?(?:participant|actor)\\s+(${ID})`));
    if (p) { declared.add(p[1]); return; }
    const m = l.match(new RegExp(`^\\s*(${ID})\\s*(?:-->>|->>|-->|->|--x|-x|--\\)|-\\))\\s*[+-]?(${ID})\\s*:`));
    if (m) { ends.push({ id: m[1], line: i + 1 }, { id: m[2], line: i + 1 }); }
  });
  if (declared.size === 0) return [];
  const out = [];
  const seen = new Set();
  for (const e of ends) {
    if (declared.has(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    const d = slipFor(e.id, declared);
    out.push({ kind: 'undeclared-participant', line: e.line, detail: `\`${e.id}\` sends or receives a message but was never declared${d ? `; did you mean \`${d}\`?` : ''} (declared: ${[...declared].join(', ')})` });
  }
  return out;
}

// `%% src: path/file.ext:LINE[-LINE]` comments: does each point at a real, non-blank line inside the root?
const SOURCE_COMMENT = /%%\s*src:\s*(.*)$/i;
export function sourceFindings(text, root, lineBase = 0, { requireQuote = false } = {}) {
  const findings = [];
  let checked = 0;
  let ok = 0;
  let realRoot;
  try { realRoot = realpathSync(root); } catch { return { findings, checked, ok }; }
  text.split(/\r?\n/).forEach((l, i) => {
    const m = l.match(SOURCE_COMMENT);
    if (!m) return;
    // Mermaid rejects a comment after a statement (only a comment on its own line is ignored), with a message that
    // does not say so: name the cause.
    if (l.slice(0, m.index).trim() !== '') findings.push({ kind: 'trailing-comment', line: i + 1 + lineBase, detail: 'a `%% src:` comment after a statement does not parse; put it on its own line above the node or edge it supports' });
    let tokens = 0;
    let consumed = 0;
    const gaps = [];
    for (const t of m[1].matchAll(/((?:[\w.@+-]+\/)*[\w.@+-]+\.[A-Za-z][A-Za-z0-9]{0,7}):(\d+)(?:-(\d+))?(?:\s*["“]([^"”]{4,120})["”])?/g)) {
      gaps.push(m[1].slice(consumed, t.index));
      consumed = t.index + t[0].length;
      tokens++;
      checked++;
      const line = i + 1 + lineBase;
      const start = Number(t[2]);
      const end = t[3] ? Number(t[3]) : start;
      const bad = (kind, detail) => findings.push({ kind, line, detail: `${t[0]}: ${detail}` });
      const p = resolve(root, t[1]);
      let real;
      try { if (!statSync(p).isFile()) throw new Error('not a file'); real = realpathSync(p); } catch { bad('missing-file', `no file ${t[1]} under ${root}`); continue; }
      const rel = relative(realRoot, real);
      if (rel.startsWith('..') || isAbsolute(rel)) { bad('outside-root', 'the file is outside the root'); continue; }
      const lines = readFileSync(real, 'utf8').split(/\r?\n/);
      if (lines.at(-1) === '') lines.pop();
      if (start < 1 || end < start) { bad('bad-range', 'the range runs backwards or starts before line 1'); continue; }
      if (end > lines.length) { bad('out-of-range', `${t[1]} has ${lines.length} line${lines.length === 1 ? '' : 's'}`); continue; }
      if (!t[3] && !t[4] && lines[start - 1].trim() === '') { bad('blank-line', `line ${start} of ${t[1]} is blank`); continue; }
      if (requireQuote && !t[4]) { bad('missing-quote', 'real-code citations need a quoted source snippet (4 to 120 characters)'); continue; }
      if (t[4]) {
        // A quoted snippet must appear on the cited lines or within two lines of them; if it is elsewhere, say where.
        const norm = (x) => x.replace(/\s+/g, ' ').trim();
        const want = norm(t[4]);
        if (!norm(lines.slice(Math.max(0, start - 3), end + 2).join(' ')).includes(want)) {
          let at = null;
          for (let k = 0; k < lines.length && at === null; k++) { const i = norm(lines.slice(k, k + 4).join(' ')).indexOf(want); if (i >= 0 && i < norm(lines[k]).length) at = k + 1; }
          bad('quote-mismatch', at ? `the quote is at line ${at}, not near ${start}` : `the quote does not appear in ${t[1]}`);
          continue;
        }
      }
      ok++;
    }
    gaps.push(m[1].slice(consumed));
    if (requireQuote && (tokens === 0 || gaps.some(gap => /[^\s,;]/.test(gap)))) findings.push({ kind: 'malformed-src', line: i + 1 + lineBase, detail: 'use path:line "source snippet" references separated by whitespace, commas, or semicolons; the entire comment must be valid' });
  });
  return { findings, checked, ok };
}

// Coverage is structural traceability, not proof that the diagram interprets its source correctly.
const LAYOUT_STATEMENT = /^(?:(?:direction|classDef|style|linkStyle|click)\s|(?:accTitle|accDescr|title)\s*[:{])/i;
const SEQUENCE_LAYOUT = /^(?:(?:(?:create\s+)?(?:participant|actor)|activate|deactivate|rect|box)\s|(?:end|autonumber|else|and|par)\s*$)/i;

// Split flowchart statements without treating semicolons inside labels as statement separators.
function splitStatements(line, type) {
  if (type !== 'flowchart') return line ? [line] : [];
  const parts = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  let edgeLabel = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i - 1] !== '\\') quoted = !quoted;
    if (quoted) continue;
    if (c === '|' && depth === 0) edgeLabel = !edgeLabel;
    if (edgeLabel) continue;
    if ('[({'.includes(c)) depth++;
    if ('])}'.includes(c)) depth = Math.max(0, depth - 1);
    if (c === ';' && depth === 0) { parts.push(line.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(line.slice(start).trim());
  return parts.filter(Boolean);
}

function visiblyUnverified(statement, type) {
  const marked = (label, node = false) => (node ? /^\s*["[({]*\s*unverified\s*:/i : /^\s*"?unverified\b/i).test(label ?? '');
  if (type === 'flowchart') {
    const withoutLabels = statement.replace(/"[^"]*"|\|[^|]*\||\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, '');
    const arrows = [...withoutLabels.matchAll(new RegExp(ARROW.source, 'g'))];
    if (arrows.length) return arrows.length === 1 && /-\.->/.test(arrows[0][0]) && marked(statement.match(/-\.->\s*\|([^|]*)\|/)?.[1]);
    // A marker in an id or comment is not visible uncertainty in the diagram.
    return new RegExp(`^${ID}\\s*(?:\\[|\\(|\\{)`).test(statement) && marked(statement.match(/^[^[({]+[\[({](.*)[\])}]\s*(?:::[\w-]+)?$/)?.[1], true);
  }
  if (type === 'sequenceDiagram') return marked(statement.match(new RegExp(`^${ID}\\s*--(?:>>|>|x|\\))\\s*[+-]?${ID}\\s*:\\s*(.*)$`))?.[1]);
  return false;
}

function sourceStatements(text) {
  const lines = text.split(/\r?\n/);
  const type = diagramType(text);
  let start = 0;
  if (lines[0]?.trim() === '---') { const e = lines.findIndex((l, k) => k > 0 && l.trim() === '---'); start = e > -1 ? e + 1 : lines.length; }
  while (start < lines.length && (!lines[start].trim() || lines[start].trim().startsWith('%%'))) start++;
  const statements = [];
  let pending = false;
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('%%')) { pending = SOURCE_COMMENT.test(t); continue; }
    const parts = splitStatements(t, type);
    if (i === start) parts.shift(); // The diagram declaration, including an optional flowchart direction.
    for (const statement of parts) {
      const structural = LAYOUT_STATEMENT.test(statement) || /^[{}]$/.test(statement)
        || (type === 'sequenceDiagram' && SEQUENCE_LAYOUT.test(statement))
        || (type === 'flowchart' && /^(?:(?:subgraph|class)\s|end\s*$)/i.test(statement));
      if (!structural) statements.push({ line: i + 1, cited: pending, unverified: visiblyUnverified(statement, type) });
      pending = false; // A comment never jumps across a structural line or a second statement.
    }
    pending = false;
  }
  return statements;
}

export function sourceCoverage(text) {
  const statements = sourceStatements(text);
  return { statements: statements.length, cited: statements.filter(s => s.cited).length, unverified: statements.filter(s => s.unverified).length };
}

// ---------- rendering ----------

// The command that runs mmdc, or null. `explicit` says $MMDC was set (then nothing else is tried).
export function findMmdc(env = process.env, cwd = process.cwd()) {
  const viaNode = (js) => [process.execPath, js];
  if (env.MMDC) {
    if (!existsSync(env.MMDC)) return { error: `MMDC points to ${env.MMDC}, which does not exist` };
    return { argv: /\.(m|c)?js$/i.test(env.MMDC) ? viaNode(env.MMDC) : [env.MMDC], via: 'MMDC' };
  }
  for (let d = resolve(cwd); ; d = dirname(d)) {
    const pkg = join(d, ...MERMAID_CLI, 'package.json');
    if (existsSync(pkg)) {
      try {
        const bin = JSON.parse(readFileSync(pkg, 'utf8')).bin;
        const rel = typeof bin === 'string' ? bin : bin?.mmdc;
        if (rel) return { argv: viaNode(join(dirname(pkg), rel)), via: `${d}${process.platform === 'win32' ? '\\' : '/'}node_modules` };
      } catch { /* fall through to PATH */ }
    }
    if (dirname(d) === d) break;
  }
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const dir of (env.PATH ?? env.Path ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    if (!dir) continue;
    for (const e of exts) {
      const p = join(dir, 'mmdc' + e);
      if (!existsSync(p)) continue;
      if (p.toLowerCase().endsWith('.cmd')) {
        // npm's Windows shim can't be spawned without a shell: run the script it points at.
        const target = [...readFileSync(p, 'utf8').matchAll(/%dp0%\\([^"%]+)/g)].map((m) => join(dirname(p), m[1])).find((t) => /\.(m|c)?js$/i.test(t) && existsSync(t));
        if (target) return { argv: viaNode(target), via: 'PATH' };
        continue;
      }
      return { argv: [p], via: 'PATH' };
    }
  }
  return null;
}

// Render one diagram with mmdc. Returns { ok, image, error } where error is the parse message with line numbers moved to the input file.
export function render(text, mmdc, { out, extra = [], lineBase = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'diagram-check-'));
  try {
    const input = join(dir, 'in.mmd');
    writeFileSync(input, text);
    const output = out ? resolve(out) : join(dir, 'out.svg');
    if (out) mkdirSync(dirname(output), { recursive: true });
    const r = spawnSync(mmdc.argv[0], [...mmdc.argv.slice(1), '-i', input, '-o', output, ...extra], { encoding: 'utf8', timeout: RENDER_TIMEOUT_MS, windowsHide: true });
    if (r.error) return { ok: false, error: `could not run mmdc: ${r.error.message}` };
    if (r.status === 0 && existsSync(output)) return { ok: true, image: out ? output : null, bytes: statSync(output).size };
    const msg = `${r.stderr}\n${r.stdout}`.split(/\r?\n/).filter((l) => l.trim() && !/^Generating single mermaid chart/.test(l));
    const cut = msg.findIndex((l, k) => k > 0 && /^\s+at |^Parser\./.test(l));
    let error = (cut > 0 ? msg.slice(0, cut) : msg.slice(0, 8)).join('\n');
    error = error.replace(/(line )(\d+)/g, (_, a, n) => `${a}${Number(n) + lineBase}`);
    return { ok: false, error: error || `mmdc exited ${r.status}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- the check ----------

export function checkBlocks(blocks, { root, mmdc, out, extra, requireSrc, noRender }) {
  return blocks.map((b) => {
    const type = diagramType(b.text);
    const findings = [];
    const sources = sourceFindings(b.text, root, b.line - 1, { requireQuote: requireSrc });
    findings.push(...sources.findings);
    if (type === 'flowchart') findings.push(...flowchartFindings(b.text).map((f) => ({ ...f, line: f.line + b.line - 1 })));
    if (type === 'sequenceDiagram') findings.push(...sequenceFindings(b.text).map((f) => ({ ...f, line: f.line + b.line - 1 })));
    if (requireSrc) {
      const uncovered = sourceStatements(b.text).filter(s => !s.cited && !s.unverified);
      if (sources.checked === 0 && uncovered.length) findings.push({ kind: 'no-src', line: b.line, detail: 'no `%% src: path:line` comment: nothing ties the verified claims to the code' });
      findings.push(...uncovered.map(s => ({ kind: 'missing-src', line: s.line + b.line - 1, detail: 'this statement needs its own preceding quoted source citation or a visible unverified label' })));
    }
    const res = { index: b.index, line: b.line, type, sources: { checked: sources.checked, resolved: sources.ok, ...sourceCoverage(b.text) } };
    let verdict = 'ok';
    if (!noRender) {
      const image = out ? (blocks.length > 1 ? out.replace(/(\.\w+)$/, `-${b.index}$1`) : out) : null;
      const r = render(b.text, mmdc, { out: image, extra, lineBase: b.line - 1 });
      res.rendered = r.ok;
      if (r.ok) { if (r.image) res.image = r.image; } else { verdict = 'invalid'; findings.unshift({ kind: 'invalid', line: b.line, detail: r.error }); }
    } else res.rendered = false;
    if (verdict === 'ok' && findings.length) verdict = 'findings';
    return { ...res, verdict, findings };
  });
}

// ---------- selftest ----------

function selftest() {
  const problems = [];
  const want = (name, ok, detail = '') => { if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`); };
  const dir = mkdtempSync(join(tmpdir(), 'diagram-check-self-'));
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'api.ts'), 'line one\nline two\n\nline four\n');
    const kinds = (fs) => fs.map((f) => f.kind).join(',');

    // blocks and types
    const md = 'intro\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```js\nnot mermaid\n```\n\n~~~mermaid\nsequenceDiagram\n  A->>B: hi\n~~~\n';
    const bs = extractBlocks(md, 'x.md');
    want('two mermaid blocks are found, other fences are not', bs.length === 2 && bs[0].line === 4 && bs[1].line === 13 && bs[1].text.startsWith('sequenceDiagram'), JSON.stringify(bs.map((b) => b.line)));
    want('a .mmd file is one block', extractBlocks('flowchart LR\n A-->B\n', 'x.mmd').length === 1);
    want('type: flowchart, graph, sequence, after frontmatter and comments', diagramType('graph TD\nA-->B') === 'flowchart' && diagramType('%% c\nsequenceDiagram\n') === 'sequenceDiagram' && diagramType('---\ntitle: t\n---\nerDiagram\n') === 'erDiagram');

    // flowchart slips
    const F = (t) => kinds(flowchartFindings(t));
    want('a one-letter slip in an id is caught', F('flowchart LR\n  Cache[(Redis)]\n  API[API] --> Cache\n  API --> Cahce\n') === 'possible-typo');
    want('an id in another case is caught', F('flowchart LR\n  API[API service]\n  Web[Web] --> api\n') === 'possible-typo');
    want('bare short ids are fine', F('flowchart LR\n  A --> B\n  B --> C\n  A --> C\n') === '');
    want('an id declared later is fine', F('flowchart LR\n  A --> Cache\n  Cache[(Redis)]\n') === '');
    want('parentheses inside a label are not read as ids', F('flowchart LR\n  Cache[Cache (Redis)]\n  API[API] --> Cache\n  API -->|reads (hot)| DB[(Database)]\n') === '');
    want('edge labels and fan-out are read', F('flowchart TD\n  Auth[Auth] --> Users[Users] & Orders[Orders]\n  Users -->|owns| Orders\n  Orders --> Autth\n') === 'possible-typo');
    want('subgraph, style and class lines are ignored', F('flowchart LR\n  subgraph Backend\n    API[API]\n  end\n  style API fill:#fff\n  classDef hot fill:#f00\n  class API hot\n') === '');
    want('a slip is reported once, on its first line', flowchartFindings('flowchart LR\n  Cache[C]\n  X --> Cahce\n  Y --> Cahce\n').length === 1);

    // sequence slips
    const S = (t) => kinds(sequenceFindings(t));
    want('an undeclared participant is caught when others are declared', S('sequenceDiagram\n  participant Web\n  participant API\n  Web->>API: get\n  API->>Cahce: read\n') === 'undeclared-participant');
    want('the slip hint names the declared id', sequenceFindings('sequenceDiagram\n  participant Cache\n  participant API\n  API->>Cahce: read\n')[0].detail.includes('`Cache`'));
    want('no declarations means no finding', S('sequenceDiagram\n  Web->>API: get\n  API-->>Web: ok\n') === '');
    want('all declared is fine', S('sequenceDiagram\n  actor U\n  participant API\n  U->>API: x\n  API-->>U: y\n') === '');

    // source comments
    const src = (t) => sourceFindings(t, dir);
    want('a real line is resolved', src('%% src: src/api.ts:2\nA[API]').ok === 1 && src('%% src: src/api.ts:2\nA[API]').findings.length === 0);
    want('a source comment after a statement is named as the cause', kinds(src('A[API] %% src: src/api.ts:2').findings) === 'trailing-comment');
    const cov = sourceCoverage('flowchart LR\n  %% src: src/api.ts:1\n  A[a]\n  B[b]\n  %% src: src/api.ts:2\n  A --> B\n  subgraph G\n  end\n');
    want('coverage counts statements and those with a source line above', cov.statements === 3 && cov.cited === 2, JSON.stringify(cov));
    const seq = sourceCoverage('sequenceDiagram\n  participant A\n  actor B\n  %% src: src/api.ts:1\n  A->>B: go\n  B-->>A: back\n');
    want('participant declarations are not statements that need a source', seq.statements === 2 && seq.cited === 1, JSON.stringify(seq));
    want('several tokens in one comment are each checked', src('%% src: src/api.ts:1, src/api.ts:99').checked === 2 && kinds(src('%% src: src/api.ts:1, src/api.ts:99').findings) === 'out-of-range');
    want('a range is checked', kinds(src('%% src: src/api.ts:1-3').findings) === '' && kinds(src('%% src: src/api.ts:3-1').findings) === 'bad-range');
    want('a missing file is reported', kinds(src('%% src: src/nope.ts:1').findings) === 'missing-file');
    want('a blank cited line is reported', kinds(src('%% src: src/api.ts:3').findings) === 'blank-line');
    want('a path outside the root is refused', kinds(src('%% src: ../x.ts:1').findings) === 'missing-file' || kinds(src('%% src: ../x.ts:1').findings) === 'outside-root');
    want('lines are reported in the input file, not the block', sourceFindings('flowchart LR\n  %% src: src/nope.ts:1\n  A[x]\n', dir, 10).findings[0].line === 12);
    want('a comment without src: is ignored', src('%% just a note about src/api.ts:2').checked === 0);
    want('a quote on the cited line is ok', src('%% src: src/api.ts:2 "line two"').findings.length === 0 && src('%% src: src/api.ts:2 "line two"').ok === 1);
    const qm = src('%% src: src/api.ts:2 "line four"');
    want('a quote from another line says where it is, when it is more than two lines away', (() => { writeFileSync(join(dir, 'src', 'long.ts'), Array.from({ length: 12 }, (_, k) => `row ${k + 1}`).join('\n') + '\n'); const r = sourceFindings('%% src: src/long.ts:12 "row 2"', dir).findings[0]; return r.kind === 'quote-mismatch' && r.detail.includes('line 2'); })());
    want('a quote within two lines is accepted', qm.findings.length === 0);
    want('a quote that is nowhere is quote-mismatch', kinds(src('%% src: src/api.ts:2 "no such text"').findings) === 'quote-mismatch');
    want('a quoted citation on a blank line is judged by its quote', kinds(src('%% src: src/api.ts:3 "line four"').findings) === '');

    // rendering through a fake mmdc, and the CLI
    const fake = join(dir, 'fake-mmdc.js');
    writeFileSync(fake, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2);",
      "const i = a[a.indexOf('-i') + 1];",
      "const o = a[a.indexOf('-o') + 1];",
      "const t = fs.readFileSync(i, 'utf8');",
      "if (t.includes('FAIL')) { console.error('Generating single mermaid chart'); console.error('Error: Parse error on line 2:'); console.error('  ... FAIL'); console.error('Expecting SEMI, got NODE_STRING'); console.error('Parser.parseError (https://x)'); process.exit(1); }",
      "fs.writeFileSync(o, '<svg/>');",
    ].join('\n'));
    const mm = { argv: [process.execPath, fake] };
    const good = render('flowchart LR\n A-->B\n', mm);
    want('a fake mmdc that succeeds renders', good.ok === true);
    const badr = render('flowchart LR\n FAIL\n', mm, { lineBase: 10 });
    want('a parse error comes back with the message and its line moved to the input file', !badr.ok && badr.error.includes('Parse error on line 12') && !badr.error.includes('Parser.parseError'), JSON.stringify(badr));
    const both = checkBlocks(extractBlocks('```mermaid\nflowchart LR\n  A[x] --> B[y]\n```\n\n```mermaid\nflowchart LR\n  FAIL\n```\n', 'd.md'), { root: dir, mmdc: mm });
    want('one good block and one invalid block', both[0].verdict === 'ok' && both[1].verdict === 'invalid' && both[1].findings[0].kind === 'invalid', JSON.stringify(both.map((b) => b.verdict)));
    want('--require-src flags a diagram with no source comment', kinds(checkBlocks(extractBlocks('flowchart LR\n A-->B\n', 'd.mmd'), { root: dir, noRender: true, requireSrc: true })[0].findings) === 'no-src,missing-src');
    want('a diagram with quoted source comments passes --require-src', checkBlocks(extractBlocks('flowchart LR\n %% src: src/api.ts:1 "line one"\n A[x]\n', 'd.mmd'), { root: dir, noRender: true, requireSrc: true })[0].verdict === 'ok');

    const self = fileURLToPath(import.meta.url);
    const run = (args, env = {}) => spawnSync(process.execPath, [self, ...args], { encoding: 'utf8', cwd: dir, env: { ...process.env, ...env } });
    writeFileSync(join(dir, 'ok.mmd'), 'flowchart LR\n  A[x] --> B[y]\n');
    writeFileSync(join(dir, 'bad.mmd'), 'flowchart LR\n  FAIL\n');
    writeFileSync(join(dir, 'slip.mmd'), 'flowchart LR\n  Cache[C]\n  A --> Cahce\n');
    const c1 = run(['ok.mmd'], { MMDC: fake });
    want('CLI: a clean diagram exits 0 with JSON', c1.status === 0 && JSON.parse(c1.stdout).status === 'clean', `${c1.status} ${c1.stderr}`);
    const c2 = run(['bad.mmd'], { MMDC: fake });
    want('CLI: an invalid diagram exits 1', c2.status === 1 && JSON.parse(c2.stdout).blocks[0].verdict === 'invalid', `${c2.status}`);
    want('CLI: a slip exits 1 even when mmdc accepts it', run(['slip.mmd'], { MMDC: fake }).status === 1);
    want('CLI: --no-render needs no mmdc', run(['ok.mmd', '--no-render'], { MMDC: join(dir, 'gone.js') }).status === 0);
    want('CLI: a missing mmdc exits 2', run(['ok.mmd'], { MMDC: join(dir, 'gone.js') }).status === 2);
    want('CLI: a missing input exits 2', run(['nope.mmd', '--no-render']).status === 2);
    want('CLI: no argument exits 2', run([]).status === 2);
    writeFileSync(join(dir, 'none.md'), 'Just prose, no diagram.\n');
    want('CLI: a Markdown file with no mermaid block exits 2', run(['none.md', '--no-render']).status === 2);
    want('CLI: --out keeps the image', (() => { const r = run(['ok.mmd', '--out', 'img/d.svg'], { MMDC: fake }); return r.status === 0 && existsSync(join(dir, 'img', 'd.svg')); })());
    want('CLI: a source comment that does not resolve exits 1', (() => { writeFileSync(join(dir, 's.mmd'), 'flowchart LR\n  %% src: src/api.ts:99\n  A[x]\n'); return run(['s.mmd', '--no-render']).status === 1; })());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  log(`diagram-check --selftest: ${problems.length} problem(s)`);
  for (const p of problems) log(`  ✗ ${p}`);
  process.stdout.write(JSON.stringify({ status: problems.length ? 'fail' : 'ok', problems }) + '\n');
  return problems.length ? 1 : 0;
}

// ---------- main ----------

function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  const dd = argv.indexOf('--');
  const extra = dd > -1 ? argv.slice(dd + 1) : [];
  const args = dd > -1 ? argv.slice(0, dd) : argv;
  const val = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : undefined; };
  const skip = new Set(['--root', '--out'].flatMap((n) => (args.includes(n) ? [args.indexOf(n), args.indexOf(n) + 1] : [])));
  const input = args.find((a, i) => !a.startsWith('--') && !skip.has(i));
  if (!input) { log('usage: node diagram-check.mjs <file.mmd | file.md> [--root <dir>] [--out <image>] [--require-src] [--no-render] [-- <mmdc args>]'); return 2; }
  const root = resolve(val('--root') ?? '.');
  try { if (!statSync(root).isDirectory()) throw new Error('not a folder'); } catch (e) { log(`diagram-check: root ${root}: ${e.message}`); return 2; }
  let text;
  try { text = readFileSync(resolve(input), 'utf8'); } catch (e) { log(`diagram-check: can't read ${input}: ${e.message}`); return 2; }
  const blocks = extractBlocks(text, input);
  if (blocks.length === 0) { log(`diagram-check: no \`\`\`mermaid block in ${input}`); return 2; }
  const noRender = args.includes('--no-render');
  let mmdc = null;
  if (!noRender) {
    mmdc = findMmdc();
    if (!mmdc || mmdc.error) {
      log(`diagram-check: ${mmdc?.error ?? 'mmdc (mermaid-cli) not found'}. Install it with: npm install @mermaid-js/mermaid-cli (Node 22.13 or later), or run with --no-render for the static checks only and say the diagram was not rendered.`);
      return 2;
    }
  }
  const results = checkBlocks(blocks, { root, mmdc, out: val('--out'), extra, requireSrc: args.includes('--require-src'), noRender });
  const bad = results.filter((b) => b.verdict !== 'ok');
  const status = results.some((b) => b.verdict === 'invalid') ? 'invalid' : bad.length ? 'findings' : 'clean';
  process.stdout.write(JSON.stringify({ status, root, renderer: noRender ? 'not rendered (--no-render)' : mmdc.via, blocks: results }) + '\n');
  for (const b of results) for (const f of b.findings) log(`  ✗ ${basename(input)}:${f.line}  ${f.kind}: ${f.detail}`);
  for (const b of results) log(`diagram-check: block ${b.index} (${b.type || 'unknown'}) ${b.verdict}${noRender ? ', not rendered' : b.rendered ? ', rendered' : ''}; ${b.sources.cited} of ${b.sources.statements} statements cite a source, ${b.sources.unverified} visibly unverified; ${b.sources.resolved} of ${b.sources.checked} citations resolve`);
  return status === 'clean' ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)));
