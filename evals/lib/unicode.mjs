// Invisible and bidi control characters in text an agent reads. A reviewer sees nothing; the model reads every
// code point. Tag characters can spell a whole hidden instruction in ASCII ("ASCII smuggling"), a run of
// variation selectors can carry arbitrary bytes after one visible character, bidi overrides and isolates make
// the text a reviewer sees differ from the text the model reads (Trojan Source), and zero-width characters
// split words so a reviewer's search misses them. Adapted from affaan-m/ECC (MIT), scripts/ci/check-unicode-safety.js;
// the joiner, variation-selector and tag-sequence exceptions are this repo's, so emoji and non-Latin scripts pass.
//
// Code points are written as numbers so this file holds no such character itself.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const hex = (n) => `U+${n.toString(16).toUpperCase().padStart(4, '0')}`;
const inRange = (cp, a, b) => cp >= a && cp <= b;

// Always flagged: no legitimate use in skill text or code.
const ALWAYS = [
  [0x200b, 0x200b, 'zero-width space'],
  [0x2060, 0x2064, 'word joiner or invisible math operator'],
  [0xfeff, 0xfeff, 'zero-width no-break space (byte order mark)'],
  [0x202a, 0x202e, 'bidi embedding or override'],
  [0x2066, 0x2069, 'bidi isolate'],
  [0x180e, 0x180e, 'Mongolian vowel separator'],
  [0x115f, 0x1160, 'Hangul filler'],
  [0x3164, 0x3164, 'Hangul filler'],
  [0xffa0, 0xffa0, 'Hangul filler'],
];
const JOINERS = [0x200c, 0x200d]; // ZWNJ, ZWJ: needed in emoji sequences, Persian, and Indic scripts
const isSelector = (cp) => inRange(cp, 0xfe00, 0xfe0f) || inRange(cp, 0xe0100, 0xe01ef);
const isTag = (cp) => inRange(cp, 0xe0000, 0xe007f);
const BLACK_FLAG = 0x1f3f4; // base of the emoji tag sequences (subdivision flags such as England's)
const CANCEL_TAG = 0xe007f;
const isInvisible = (cp) => JOINERS.includes(cp) || isSelector(cp) || isTag(cp) || ALWAYS.some(([a, b]) => inRange(cp, a, b));
const isAsciiVisible = (cp) => cp > 0x20 && cp < 0x7f;

// Returns [{ line, column, codePoint, kind }] for every suspicious character (a run is reported once, at its
// start). Allowed: one ZWJ or ZWNJ between two visible non-ASCII characters (an emoji sequence, a Persian or
// Indic word); one variation selector after a visible character; a tag run that follows U+1F3F4 and ends with
// U+E007F (an emoji subdivision flag).
export function scanText(text) {
  const cps = Array.from(text, (c) => c.codePointAt(0));
  const found = [];
  let line = 1;
  let col = 1;
  const pos = [];
  for (const cp of cps) { pos.push([line, col]); if (cp === 0x0a) { line++; col = 1; } else col++; }
  const report = (i, kind) => found.push({ line: pos[i][0], column: pos[i][1], codePoint: hex(cps[i]), kind });
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const always = ALWAYS.find(([a, b]) => inRange(cp, a, b));
    if (always) {
      report(i, always[2]);
      while (i + 1 < cps.length && ALWAYS.some(([a, b]) => inRange(cps[i + 1], a, b))) i++; // one report per run
      continue;
    }
    const prev = cps[i - 1];
    const next = cps[i + 1];
    if (JOINERS.includes(cp)) {
      const visible = (c) => c !== undefined && !isInvisible(c) && !/\s/u.test(String.fromCodePoint(c));
      const nonAsciiLetter = (c) => c !== undefined && c > 0x7f && /\p{L}|\p{M}/u.test(String.fromCodePoint(c));
      // ZWJ: both sides non-ASCII (emoji, Indic conjuncts); a VS16 may precede it inside an emoji sequence.
      // ZWNJ: visible on both sides and a non-ASCII letter on at least one (Persian suffixes on Latin loanwords).
      const ok = cp === 0x200d
        ? next !== undefined && prev !== undefined && prev > 0x7f && next > 0x7f && visible(next) && (visible(prev) || isSelector(prev))
        : visible(prev) && visible(next) && (nonAsciiLetter(prev) || nonAsciiLetter(next));
      if (!ok) report(i, cp === 0x200d ? 'zero-width joiner outside an emoji or script sequence' : 'zero-width non-joiner outside a script sequence');
      continue;
    }
    if (isSelector(cp)) {
      const ok = prev !== undefined && !isInvisible(prev) && prev !== 0x0a && !(next !== undefined && isSelector(next));
      if (!ok) {
        report(i, 'variation selector run or stray selector (can carry hidden bytes)');
        while (i + 1 < cps.length && isSelector(cps[i + 1])) i++;
      }
      continue;
    }
    if (isTag(cp)) {
      let j = i;
      while (j + 1 < cps.length && isTag(cps[j + 1])) j++;
      const flag = prev === BLACK_FLAG && cps[j] === CANCEL_TAG && cps.slice(i, j).every((t) => t !== CANCEL_TAG);
      if (!flag) {
        const hidden = String.fromCodePoint(...cps.slice(i, j + 1).map((t) => t - 0xe0000).filter(isAsciiVisible));
        report(i, `tag characters (hidden text${hidden ? `: "${hidden.slice(0, 60)}"` : ''})`);
      }
      i = j;
    }
  }
  return found;
}

export const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.mjs', '.cjs', '.js', '.ts', '.tsx', '.jsx', '.py', '.sh', '.bash', '.ps1', '.rs', '.cs', '.html', '.css', '.xml', '.csv']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', '__pycache__', '.worktrees']);

// Every text file under dir (by extension), skipping VCS and dependency folders.
export function textFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...textFiles(p));
    else if (TEXT_EXTENSIONS.has(extname(e).toLowerCase())) out.push(p);
  }
  return out;
}

export const scanFile = (file) => scanText(readFileSync(file, 'utf8'));
