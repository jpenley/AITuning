#!/usr/bin/env node
// Screenshots a page at desktop and mobile widths, full length, for an agent (or a person) to look at.
//
//   node shoot.mjs <url|file.html> [--out <dir>] [--widths 1280,390] [--viewport-only] [--browser <path>]
//   node shoot.mjs --selftest
// Widths under 600 are emulated as mobile (touch, mobile viewport). Files are <out>/<name>-<width>.png, where <name>
// comes from the page's path; --out defaults to a folder in the system temp directory, so screenshots never land in
// the repository by accident. Prints JSON with the file paths.
// Exit: 0 written, 2 couldn't run (no browser, page wouldn't open, bad arguments).
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { withPage, toUrl } from './cdp.mjs';

const log = (s = '') => process.stderr.write(s + '\n');

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--viewport-only' || a === '--selftest') opts[a.slice(2)] = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else pos.push(a);
  }
  return { pos, opts };
}

export async function shoot(target, { out, widths = [1280, 390], full = true, browser } = {}) {
  const url = toUrl(target);
  const name = (basename(new URL(url).pathname).replace(/\.[a-z]+$/i, '') || 'page').replace(/[^\w-]+/g, '-');
  const dir = resolve(out ?? mkdtempSync(join(tmpdir(), 'flowstate-shots-')));
  mkdirSync(dir, { recursive: true });
  const files = [];
  await withPage(async (page) => {
    for (const w of widths) {
      const mobile = w < 600;
      await page.viewport(w, mobile ? 844 : 900, mobile);
      await page.goto(url);
      const png = await page.screenshot(full);
      const f = join(dir, `${name}-${w}.png`);
      writeFileSync(f, png);
      files.push({ width: w, mobile, file: f });
    }
  }, { browser });
  return { url, dir, files };
}

export async function run(argv) {
  const { pos, opts } = parseArgs(argv);
  if (!pos[0]) { log('Usage: shoot.mjs <url|file.html> [--out dir] [--widths 1280,390] [--viewport-only] [--browser path]'); return 2; }
  const widths = (opts.widths ?? '1280,390').split(',').map(Number);
  if (widths.some((w) => !Number.isInteger(w) || w < 200 || w > 3840)) { log('--widths takes whole pixel widths between 200 and 3840'); return 2; }
  try {
    const r = await shoot(pos[0], { out: opts.out, widths, full: !opts['viewport-only'], browser: opts.browser });
    for (const f of r.files) log(`${f.width}px${f.mobile ? ' (mobile)' : ''}: ${f.file}`);
    process.stdout.write(JSON.stringify({ status: 'ok', ...r }) + '\n');
    return 0;
  } catch (e) {
    log(e.message);
    return 2;
  }
}

async function selftest() {
  const problems = [];
  const tmp = mkdtempSync(join(tmpdir(), 'flowstate-shoot-test-'));
  try {
    const html = join(tmp, 'fixture.html');
    writeFileSync(html, '<!doctype html><meta name=viewport content="width=device-width"><style>body{margin:0;font:16px sans-serif}div{height:2000px;background:linear-gradient(#fff,#ddd)}</style><h1>Fixture</h1><div></div>');
    const r = await shoot(html, { out: join(tmp, 'out'), widths: [1024, 390] });
    for (const f of r.files) {
      const b = readFileSync(f.file);
      if (b.subarray(1, 4).toString() !== 'PNG') { problems.push(`${f.file} is not a PNG`); continue; }
      const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      if (w !== f.width) problems.push(`${f.width}px shot is ${w}px wide`);
      if (h < 2000) problems.push(`${f.width}px full-page shot is only ${h}px tall (content is over 2000px)`);
    }
    if (r.files.length !== 2 || !r.files[1].mobile) problems.push('expected a desktop and a mobile shot');
    if ((await run([join(tmp, 'missing.html')])) !== 2) problems.push('a missing file must exit 2');
  } catch (e) {
    problems.push(e.code === 'NO_BROWSER' ? 'no browser found: the self-test needs Chrome, Edge, or Chromium' : e.message);
  } finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  log(`shoot --selftest: ${problems.length} problem(s)`);
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
