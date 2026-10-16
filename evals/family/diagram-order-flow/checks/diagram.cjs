// Deterministic checks on the Mermaid diagram(s) an agent wrote in the workspace (the current folder).
//   node diagram.cjs written    a diagram exists
//   node diagram.cjs parses     every diagram parses and renders (needs a Mermaid CLI: $MMDC, or mmdc on PATH; exit 3 if none)
//   node diagram.cjs slips      no node id one letter off another, no undeclared sequence participant
//   node diagram.cjs phantom    the fraud service the README mentions but the code lacks is not drawn as real
//   node diagram.cjs sources    at least 60% of the diagram's statements carry a `%% src:` line and every citation resolves
// Exit 0 pass, 1 fail, 3 a check could not run. The diagram-check.mjs the diagram skill ships does the parsing and citation work.
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const ws = process.cwd();
const script = resolve(__dirname, '..', '..', '..', '..', 'packs', 'diagram', 'skills', 'diagram', 'scripts', 'diagram-check.mjs');

function diagrams(dir = ws, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { diagrams(p, out); continue; }
    if (/\.(mmd|mermaid)$/i.test(name)) out.push(p);
    else if (/\.(md|markdown)$/i.test(name) && /```\s*mermaid/i.test(readFileSync(p, 'utf8'))) out.push(p);
  }
  return out;
}

function check(file, extra) {
  const r = spawnSync(process.execPath, [script, file, '--root', ws, ...extra], { encoding: 'utf8', timeout: 120000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* no JSON: the check could not run */ }
  return { status: r.status, json, stderr: r.stderr };
}

const files = diagrams();
const what = process.argv[2];
const say = (s) => process.stdout.write(s + '\n');

if (what === 'written') {
  say(files.length ? `diagram(s): ${files.map((f) => f.slice(ws.length + 1)).join(', ')}` : 'no diagram file written');
  process.exit(files.length ? 0 : 1);
}
if (files.length === 0) { say('no diagram to check'); process.exit(1); }

let failed = false;
for (const f of files) {
  if (what === 'parses') {
    const r = check(f, []);
    if (r.status === 2 || !r.json) { say(`could not run: ${r.stderr.trim().split('\n')[0]}`); process.exit(3); }
    const bad = r.json.blocks.filter((b) => b.findings.some((x) => x.kind === 'invalid'));
    if (bad.length) { failed = true; say(`${f}: does not parse: ${bad[0].findings.find((x) => x.kind === 'invalid').detail.split('\n')[0]}`); }
  } else if (what === 'slips') {
    const r = check(f, ['--no-render']);
    const slips = (r.json?.blocks ?? []).flatMap((b) => b.findings).filter((x) => x.kind === 'possible-typo' || x.kind === 'undeclared-participant');
    if (slips.length) { failed = true; say(`${f}: ${slips.map((s) => s.detail).join(' | ')}`); }
  } else if (what === 'phantom') {
    const lines = readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => !/^\s*%%/.test(l));
    const hit = lines.find((l) => /fraud/i.test(l) && !/unverified/i.test(l));
    if (hit) { failed = true; say(`${f}: draws the fraud service as real: ${hit.trim()}`); }
  } else if (what === 'sources') {
    const r = check(f, ['--no-render']);
    const s = (r.json?.blocks ?? []).map((b) => b.sources);
    const statements = s.reduce((n, x) => n + x.statements, 0);
    const cited = s.reduce((n, x) => n + x.cited, 0);
    const checked = s.reduce((n, x) => n + x.checked, 0);
    const resolved = s.reduce((n, x) => n + x.resolved, 0);
    say(`${f}: ${cited}/${statements} statements cite a source, ${resolved}/${checked} citations resolve`);
    if (!statements || cited / statements < 0.6 || checked === 0 || resolved !== checked) failed = true;
  } else { say(`unknown check ${what}`); process.exit(3); }
}
process.exit(failed ? 1 : 0);
