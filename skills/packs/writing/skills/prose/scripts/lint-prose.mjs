#!/usr/bin/env node
// lint-prose.mjs: deterministic linter for the mechanical AI tells in prose written for people
// (READMEs, docs, PR bodies, release notes, posts, newsletters, essays). No model calls, no network, no dependencies.
// Rules adapted from poteto's unslop skill (pstack, MIT, Lauren Tan) and Peter Yang's no-ai-slop skill (MIT);
// rule ids keep unslop's numbers, and no-ai-slop's patterns that unslop doesn't number start at u34.
//
// Usage: node lint-prose.mjs <file|dir|glob>... [--config <file>] [--json]
//        node lint-prose.mjs - [--config <file>]        (reads text from stdin)
//        node lint-prose.mjs --selftest
//   A directory is walked for *.md, skipping node_modules, .git and external.
//   --json only silences the human report; the JSON object is always written to stdout.
// Exit codes: 0 clean, 1 findings, 2 could not run (no input, unreadable file, bad config). Never read 2 as clean.
// stdout: one JSON object {status, files, counts, findings[]}; stderr: human-readable report.
// Each finding: {file, line, column, rule, match, message, suggestion}. Columns are 1-based UTF-16 units.
// suggestion is null when there is no mechanical replacement, and "" when the fix is to delete the match.
//
// Config: .prose-lint.json, found by walking up from each file's folder (stdin: from the working folder),
// or --config <file> for every input:
//   {"disable": ["u13-em-dash", ...], "words": {"allow": [...], "deny": [...]}}
// Every rule is on by default. words.allow exempts a word or phrase from every word-list rule and from the
// title-case count (use it for proper nouns). words.deny adds words, reported under u7-ai-vocab.
// Taste rules (on by default; disable them when a project's style differs): u13-em-dash, u14-colon,
// u17-title-case.
//
// Ignored: YAML frontmatter, fenced code (``` and ~~~, closed only by a fence of the same character at least as
// long), inline code spans, URLs, link targets and reference definitions, HTML comments and tags.
// Indented code blocks are not ignored: in a list they can't be told from continuation text without a full parser.
// A phrase being mentioned is skipped by the phrase rules: quotes hug it, or it sits inside a straight or curly
// double-quoted span on its line (a quoted example sentence).
//
// Implemented: u3 superficial "-ing" clauses (narrow: a participle after a comma; verbs with a literal sense, such as
// "highlighting" and "reflecting", count only before an abstract object), u5 vague attribution (skipped after a
// determiner or a named source, or when the sentence cites one), u7 AI vocabulary, u8 fancy "is", u9 binary contrasts
// ("not just X, but Y", "isn't X, it's Y", "It's not X. It's Y."), u13 em dash, u14 mid-sentence colon (narrow: only
// after an opening "If/When/Unlike/Instead of..." clause), u16 inline-header list items that restate the line, u17
// title-case headings, u18 decorative emoji in headings and bullets, u19 curly quotes, u20 chatbot phrases, u22
// sycophancy, u23 filler phrases, u24 stacked hedges, u25 generic conclusions, u26 abstract metaphor nouns, u29
// passive voice (narrow: only "is <participle> by <actor>", where the actor is named), u31 plain words, u34
// throat-clearing openers, u35 fake-insight setups, u36 metadiscourse that tells the reader what to notice, u37
// rhetorical setups, u38 importance puffery, u39 negative listing ("Not a X. Not a Y."), u40 recap endings (narrow:
// "Ultimately,", "Overall,", "In summary," and the like opening the last paragraph of a piece of three or more blocks),
// and from blader/humanizer (MIT): u41 defences against an objection nobody raised, u42 guesses dressed as knowledge
// limits, u43 sentences about the document ("the table below compares"), u45 brochure words, and chatbot offers
// ("would you like me to", "want me to …?", "should I continue?") in u20. Its repeated-sentence-openings pattern is
// not a rule: over the external/ mirrors it fired 341 times, mostly on deliberate parallel instructions ("If A… If
// B…"), so it stays a judgement call in VOICE.md.
// From SlopMonster (MIT): u46 marketing-copy constructions ("whether you're a X or a Y", "say goodbye to") and "that
// being said" in u23. Its score out of 5 and its wide word list stay out: a score is gameable and the words are common.
// Skipped: u12 false ranges ("from X to Y" is trivial to find, but whether X and Y share a scale is judgement), the
// judgement rules (u10, u11, u15, u27, u28, u30, u32, u33), and no-ai-slop's judgement patterns: colon reveals,
// dramatic fragments ("No X. No Y. Just Z.") and robotic rhythm, synonym cycling, fake-profound kickers, redundant
// "in other words", the portability test, and often-empty adverbs ("just", "honestly": whether one carries the
// writer's voice is judgement). From no-ai-slop's word list, robust, streamline, elevate and harness stay out: they
// have technical senses here ("elevated permissions", the streamline skill, a test harness).

import { readFileSync, statSync, readdirSync, existsSync, globSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- masking: blank out what isn't prose, keeping every offset ----------

const blankOut = (m) => m.replace(/[^\n]/g, ' ');

export function maskText(text) {
  const lines = text.split('\n');
  const starts = [];
  let off = 0;
  for (const l of lines) { starts.push(off); off += l.length + 1; }
  const a = text.split('');
  const blank = (s, e) => { for (let i = s; i < e && i < a.length; i++) if (a[i] !== '\n') a[i] = ' '; };

  let first = 0;
  if (/^---[ \t]*$/.test(lines[0] ?? '')) {
    for (let j = 1; j < lines.length; j++) {
      if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[j])) { blank(0, starts[j] + lines[j].length); first = j + 1; break; }
    }
  }
  for (let j = first; j < lines.length; j++) {
    const m = /^([ \t>]*)(`{3,}|~{3,})(.*)$/.exec(lines[j]);
    if (!m || (m[2][0] === '`' && m[3].includes('`'))) continue;
    const close = new RegExp(`^[ \\t>]*${m[2][0]}{${m[2].length},}[ \\t]*$`);
    let k = j + 1;
    while (k < lines.length && !close.test(lines[k])) k++;
    const end = Math.min(k, lines.length - 1);
    blank(starts[j], starts[end] + lines[end].length);
    j = end;
  }
  let s = a.join('');
  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, blankOut);

  // Inline code: a backtick run opens a span only if a run of the same length closes it within the paragraph.
  const b = s.split('');
  const open = /`+/g;
  let m;
  while ((m = open.exec(s))) {
    if (m.index > 0 && s[m.index - 1] === '\\') continue;
    const n = m[0].length;
    const close = new RegExp(`(?<!\`)\`{${n}}(?!\`)`, 'g');
    close.lastIndex = m.index + n;
    const c = close.exec(s);
    if (!c || /\n[ \t]*\n/.test(s.slice(m.index + n, c.index))) continue;
    for (let q = m.index; q < c.index + n; q++) if (b[q] !== '\n') b[q] = ' ';
    open.lastIndex = c.index + n;
  }
  s = b.join('');

  const keepBracket = (x) => ']' + blankOut(x.slice(1));
  s = s
    .replace(/^ {0,3}\[[^\]\n]+\]:[ \t]*\S.*$/gm, blankOut)
    .replace(/\]\(<[^>\n]*>(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g, keepBracket)
    .replace(/\]\((?:[^()\s]|\([^()\s]*\))*(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g, keepBracket)
    .replace(/\]\[[^\]\n]*\]/g, keepBracket)
    .replace(/<(?:https?|ftp|mailto):[^>\s]*>|<[^@\s<>]+@[^>\s]+>/g, blankOut)
    .replace(/\b(?:https?|ftp|file):\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/g, blankOut)
    .replace(/<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>/g, blankOut);
  return s;
}

// ---------- rules ----------

const B0 = '(?<![\\p{L}\\p{N}_])';
const B1 = '(?![\\p{L}\\p{N}_])';
const phraseRe = (src, flags = 'giu') => new RegExp(`${B0}(?:${src.replace(/ /g, '\\s+')})${B1}`, flags);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A phrase inside quotes is being mentioned (never say "Great question!"), not used: the quotes hug the phrase,
// or the phrase sits inside a straight double-quoted span on its line (a quoted example sentence).
const quoted = (text, i, n) => /["'“‘]/.test(text[i - 1] ?? '') && /^[!?.,]*["'”’]/.test(text.slice(i + n));
const inQuotes = (masked, i, n) => {
  const start = masked.lastIndexOf('\n', i - 1) + 1;
  const end = masked.indexOf('\n', i + n);
  const before = masked.slice(start, i);
  const after = masked.slice(i + n, end < 0 ? undefined : end);
  return ((before.split('"').length - 1) % 2 === 1 && after.includes('"'))
    || (before.lastIndexOf('“') > before.lastIndexOf('”') && after.includes('”'));
};
const mentioned = (ctx, i, n) => quoted(ctx.text, i, n) || inQuotes(ctx.masked, i, n);

// One finding per stretch of text: of overlapping matches from one rule, keep the first (the longer on a tie).
const dropOverlaps = (found) => {
  const kept = [];
  let end = -1;
  for (const f of found.sort((a, b) => a.index - b.index || b.match.length - a.match.length)) {
    if (f.index >= end) { kept.push(f); end = f.index + f.match.length; }
  }
  return kept;
};

// The sentence around a match, from the original text: back to the last sentence end or blank line, forward
// to the next one (a footnote marker right after the full stop belongs to the sentence).
function sentenceAround(text, i, n) {
  const back = text.slice(Math.max(0, i - 500), i);
  let s = 0;
  for (const m of back.matchAll(/[.!?]["')\]]*\s+|\n[ \t]*\n/g)) s = m.index + m[0].length;
  const fwd = text.slice(i + n, i + n + 500);
  const e = /[.!?](?:\[\^?[\w-]+\])*(?=\s|$)|\n[ \t]*\n/.exec(fwd);
  return back.slice(s) + text.slice(i, i + n) + (e ? fwd.slice(0, e.index + e[0].length) : fwd);
}

// A word-list rule: each term is [regex source, key, suggestion ('' = delete, null = none)].
// extra.skip(ctx, m) drops a match its guard rules out.
const termRule = (id, message, terms, extra = {}) => ({
  id,
  ...extra,
  terms: terms.map(([src, key, suggestion]) => ({ re: phraseRe(src), key, suggestion })),
  run(ctx) {
    const out = [];
    for (const t of this.terms) {
      t.re.lastIndex = 0;
      for (const m of ctx.masked.matchAll(t.re)) {
        if (mentioned(ctx, m.index, m[0].length) || this.skip?.(ctx, m)) continue;
        out.push({ index: m.index, match: m[0], key: t.key, message: typeof message === 'function' ? message(t) : message, suggestion: t.suggestion });
      }
    }
    return dropOverlaps(out);
  },
});

const regexRule = (id, re, message, suggestion = null, extra = {}) => ({
  id,
  ...extra,
  run(ctx) {
    return [...ctx.masked.matchAll(re)].map((m) => ({
      index: m.index, match: m[0], message, suggestion: typeof suggestion === 'function' ? suggestion(m) : suggestion,
    }));
  },
});

// Line-level structure: headings and list items.
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT_UNDER = /^ {0,3}(?:=+|-{2,})[ \t]*$/;
const LIST = /^([ \t]*(?:>[ \t]*)*(?:[-*+]|\d{1,9}[.)])[ \t]+)(.*)$/;

function headings(ctx) {
  const out = [];
  const L = ctx.lines;
  for (let j = 0; j < L.length; j++) {
    const m = ATX.exec(L[j]);
    if (m && m[2]) { out.push({ line: j, start: ctx.starts[j] + L[j].indexOf(m[2]), text: m[2] }); continue; }
    if (j + 1 < L.length && SETEXT_UNDER.test(L[j + 1]) && L[j].trim() && (j === 0 || !L[j - 1].trim())
      && !LIST.test(L[j]) && !/^\s*[#>|]/.test(L[j]) && !SETEXT_UNDER.test(L[j])) {
      const text = L[j].trim();
      out.push({ line: j, start: ctx.starts[j] + L[j].indexOf(text), text });
    }
  }
  return out;
}

function listItems(ctx) {
  const out = [];
  ctx.lines.forEach((l, j) => {
    const m = LIST.exec(l);
    if (m && m[2].trim()) out.push({ line: j, start: ctx.starts[j] + m[1].length, text: m[2] });
  });
  return out;
}

const SMALL = new Set('a an the and but or nor for so yet of to in on at by up via vs with from into onto as per off out over than'.split(' '));
const STOP = new Set('the a an and or of to in on for with is are be it this that by as at from its every each all any some no what which who how when where there their our your my one'.split(' '));
const stemW = (w) => w.toLowerCase().replace(/(?:ments?|ings?|ed|es|s|ly)$/, '').slice(0, 6);

const EMOJI = /(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic})(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*/gu;
const NOT_EMOJI = (cp) => cp === 0xa9 || cp === 0xae || cp === 0x203c || cp === 0x2049 || cp === 0x2122 || cp === 0x2139
  || (cp >= 0x2194 && cp <= 0x2199) || cp === 0x21a9 || cp === 0x21aa;

const HEDGE = '(?:could|might|may|possibly|potentially|perhaps|arguably|conceivably|presumably|seemingly|probably|likely)';
const PARTICIPLE = '(?:\\w+ed|built|done|made|given|taken|run|known|shown|seen|held|set|read|kept|sent|found|thrown|written|driven|chosen|drawn|hidden|bound|caught|brought|taught|told|sold|led|left|lost|met|paid|put|said|spent|split|spread|struck|torn|understood|overridden|rewritten|undone)';
const NOT_ACTOR = '(?:default|hand|design|itself|themselves|name|id|reference|value|now|far|accident|mistake|chance|convention|path|key|index|position|type|line|the way)';
const IN_PARA = '(?:(?!\\n[ \\t]*\\n)[^.!?;])';
const SENTENCE_START = '(?<=^|[.!?]["\')’”]*\\s+|\\n)';

// Importance puffery (u38). u3 also reads these at a participle after a comma, and u38 leaves that case to u3.
const PUFF_ADJ = 'vital|key|crucial|pivotal|critical|significant|central|important|major|instrumental|essential|fundamental|integral|decisive|outsized|foundational|leading|prominent|defining';
const MOMENT_ADJ = 'pivotal|significant|major|important|key|historic|defining|critical|crucial|monumental|seminal|landmark|momentous|decisive|remarkable|notable|turning|transformative|groundbreaking|watershed';
const PUFFERY = [
  [`pla(?:y|ys|yed|ying) (?:a|an) (?:${PUFF_ADJ}) (?:role|part)`, 'plays a vital role'],
  [`mark(?:s|ed|ing)? (?:a|an|the) (?:(?:${MOMENT_ADJ}) (?:moment|milestone|step|shift|chapter|era|point|juncture|departure|leap|achievement|day)|turning point|watershed(?: moment)?|new (?:era|chapter|dawn))`, 'marks a pivotal moment'],
  [`represent(?:s|ed|ing)? (?:a|an) (?:${MOMENT_ADJ}|paradigm|fundamental|seismic|quantum|giant|huge|massive) (?:shift|leap|milestone|moment|departure|turning point|step forward|leap forward)`, 'represents a paradigm shift'],
  ["(?:solidif(?:y|ies|ied|ying)|cement(?:s|ed|ing)?) (?:its|their|his|her|our|your|(?:the )?\\p{L}+['’]s) (?:position|place|status|role|reputation|standing|lead|dominance|legacy|foothold)", 'solidifies its position'],
  // Not the base form: "Emphasize the importance of X" in an instruction file is an instruction, not a claim.
  ['(?:underscor(?:es|ed|ing)|highlight(?:s|ed|ing)|emphasi[sz](?:es|ed|ing)|reinforc(?:es|ed|ing)|reaffirm(?:s|ed|ing)|demonstrat(?:es|ed|ing)|show(?:s|ed|ing|n)) (?:its|their|his|her|our|the) (?:(?:growing|continued|ongoing|enduring|lasting|broader|true|real|deep) )?(?:significance|importance)', 'underscores its significance'],
  ['(?:a|an) (?:(?:true|lasting|living|real|powerful|clear|fitting|shining|enduring) )?testament to', 'a testament to'],
  ['(?:stand(?:s|ing)?|stood) as a (?:symbol|beacon|monument|reminder|model)', 'stands as a symbol'],
  ['pav(?:e|es|ed|ing) the way (?:for|to)', 'paves the way'],
  ['set(?:s|ting)? the stage for', 'sets the stage for'],
  ['at the forefront of', 'at the forefront of'],
  ['(?:leave|leaves|left|leaving) an? (?:indelible|lasting|enduring) (?:mark|impression|legacy)', 'leaves an indelible mark'],
  ["(?:cannot|can['’]t|could not|couldn['’]t) be overstated", 'cannot be overstated'],
];
const PUFFERY_AT = new RegExp(`^(?:${PUFFERY.map(([src]) => src.replace(/ /g, '\\s+')).join('|')})${B1}`, 'iu');

// Superficial "-ing" clauses (u3): a participle after a comma that claims meaning instead of stating a fact.
// The strong verbs are the tell with any object; the weak ones have literal senses ("highlighting the current
// line"), so they count only before an abstract object ("the need for", "a broader shift toward", "the team's
// commitment to", "how seriously").
const ING_STRONG = new Set('underscoring showcasing emphasizing emphasising symbolizing symbolising cementing solidifying exemplifying epitomizing epitomising reaffirming'.split(' '));
const ING_WEAK = new Set(['highlighting', 'reflecting', 'demonstrating', 'illustrating', 'signaling', 'signalling', 'reinforcing', 'marking', 'contributing to', 'playing', 'underlining', 'showing', 'representing']);
const ING_MOD = `\\p{L}+['’]s|new|growing|broader|wider|larger|increasing|ongoing|continued|deep|deeper|strong|lasting|enduring|true|real|genuine|unwavering|renewed|fundamental|${MOMENT_ADJ}|profound|seismic`;
const ING_NOUN = 'importance|significance|commitment|dedication|relevance|legacy|resilience|urgency|versatility|ambition|heritage|ethos|passion|vision|need|shift|trend|power|potential|momentum|milestone|moment|turning point|era|chapter|departure|excellence|leadership|prowess|innovation';
const ING_OBJECT = new RegExp(`^\\s+(?:(?:(?:the|its|their|our|his|her|this|that|a|an)\\s+)?(?:(?:${ING_MOD})\\s+){0,2}(?:${ING_NOUN})(?=\\s*(?:[.,;:!?)]|$)|\\s+(?:of|for|to|toward|towards|in|that|within|across|among|amid|behind|at)${B1})|how\\s+(?:much|important|seriously|deeply|crucial|vital|essential|far)${B1})`, 'iu');

// Vague attribution (u5): skipped when the phrase follows a determiner ("our research", "the study"), a named
// source in the three words before it ("Stanford study", "Anthropic's own research"), or the sentence cites one
// (a link, footnote, "et al.", a year in parentheses, "according to <Name>"). "Reveals", "confirms" and
// "demonstrates" count only before "that": "as research reveals more paths" is research the reader is doing.
const ATTR_VERB = 'show|shows|showed|have shown|has shown|suggest|suggests|suggested|indicate|indicates|find|finds|found|have found|has found|prove|proves|proved|(?:reveal|reveals|revealed|confirm|confirms|confirmed|demonstrate|demonstrates|demonstrated) that';
const DETERMINER_BEFORE = /(?:^|[^\p{L}])(?:the|our|my|this|that|these|those|their|his|her|its|your|such|both|either|each)\s+$/iu;
const CITATION = /\[[^\]\n]+\][([]|\[\^[^\]\n]+\]|\[\d+(?:[,–-]\s*\d+)*\]|\bet al\b|\((?:[^()\n]*[\s,])?(?:1[5-9]|20)\d\d[a-z]?(?:[\s,;][^()\n]*)?\)|according to (?:the )?\p{Lu}|https?:\/\//u;
function namedSource(ctx, m) {
  if (CITATION.test(sentenceAround(ctx.text, m.index, m[0].length))) return true;
  // Only a "<source> <verb>" phrase has its source in front: in "Python is widely regarded as", Python is the subject.
  if (/^(?:widely|universally|generally|according|it)\b/i.test(m[0])) return false;
  const line = ctx.masked.slice(ctx.masked.lastIndexOf('\n', m.index - 1) + 1, m.index);
  if (DETERMINER_BEFORE.test(line)) return true;
  // The clause before the match: from the last sentence end or clause punctuation, or the list marker.
  let from = 0;
  for (const b of line.matchAll(/[.!?:]["')\]*_]*\s+|[,;()—]\s*|^[ \t>]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?/gu)) from = b.index + b[0].length;
  const words = [...line.slice(from).matchAll(/[\p{L}\p{N}][\p{L}\p{N}.&'’-]*/gu)];
  for (const [k, w] of words.entries()) {
    if (k < words.length - 3) continue;
    const word = w[0];
    if (/['’]s$/.test(word) || /^\p{Lu}.*\p{Lu}/u.test(word) || (k > 0 && /^\p{Lu}/u.test(word) && word !== 'I')) return true;
  }
  return false;
}

// Binary contrasts (u9). A negation inside an opening condition ("If the check isn't green, it's done later") is
// not one; the condition ends at its comma, and a contrast in the main clause after it still counts.
const NOT_JUST = new RegExp(`${B0}not\\s+(?:just|only|merely|simply)\\s${IN_PARA}{1,80}?${B0}but${B1}`, 'giu');
const IT_IS_NOT = new RegExp(`${B0}(?:it['’]s|it\\s+is|this\\s+is|that['’]s|that\\s+is)\\s+not\\s${IN_PARA}{1,60}?[,;]\\s+(?:it['’]s|it\\s+is)${B1}`, 'giu');
const NEG = "(?:isn['’]t|is\\s+not|aren['’]t|are\\s+not|wasn['’]t|was\\s+not|weren['’]t|were\\s+not|it['’]s\\s+not|that['’]s\\s+not)";
const ISNT_ITS = new RegExp(`${B0}${NEG}\\s${IN_PARA}{1,60}?(?:[,;]\\s+(?:it['’]s|it\\s+is|they['’]re|they\\s+are|that['’]s)${B1}(?!\\s+not${B1})|[.!]\\s+(?:it['’]s|it\\s+is|they['’]re|they\\s+are)\\s+(?:a|an|the|about|what|how|where|who|when|why|your|our|their|my|his|her|its|just|only|all|one|more|less)${B1})`, 'giu');
const CONDITION = /^\s*(?:(?:[-*+>]|\d{1,9}[.)])\s+)?(?:\*\*|__|_|\*)?(?:if|when|whenever|unless|until|because|since|while|once|whether|although|though|even if|as long as)\b[^,;]*$/i;
const sentencePrefix = (masked, i) => {
  const back = masked.slice(Math.max(0, i - 300), i);
  let s = back.lastIndexOf('\n') + 1;
  for (const m of back.matchAll(/[.!?]["')\]]*\s+/g)) s = Math.max(s, m.index + m[0].length);
  return back.slice(s);
};

export const RULES = [
  {
    id: 'u3-superficial-ing',
    run(ctx) {
      const out = [];
      for (const m of ctx.masked.matchAll(/,\s+(\p{L}+ing(?:\s+to)?)(?![\p{L}\p{N}_])/giu)) {
        const at = m.index + m[0].length - m[1].length;
        const verb = m[1].toLowerCase().replace(/\s+/g, ' ');
        const rest = ctx.masked.slice(at + m[1].length);
        if (!ING_STRONG.has(verb) && !(ING_WEAK.has(verb) && ING_OBJECT.test(rest)) && !PUFFERY_AT.test(ctx.masked.slice(at))) continue;
        const n = m[1].length + /^(?:(?!\n[ \t]*\n)[^.!?;:"”])*/.exec(rest)[0].trimEnd().length;
        if (mentioned(ctx, at, n)) continue;
        out.push({ index: at, match: ctx.masked.slice(at, at + n), message: 'superficial "-ing" clause; cut it, or state the concrete consequence', suggestion: null });
      }
      return out;
    },
  },
  termRule('u5-vague-attribution', 'vague attribution; name the source or cut the claim', [
    ['experts? (?:agree|agrees|believe|believes|say|says|suggest|suggests|argue|argues|warn|warns|predict|predicts|recommend|recommends|estimate|estimates|claim|claims|note|notes|concur)', 'experts agree', null],
    [`(?:(?<!case )stud(?:y|ies)|research) (?:${ATTR_VERB})`, 'studies show', null],
    ['industry (?:reports?|analysts?|observers?|insiders?|leaders?|watchers?|data|surveys?|sources) (?:suggest|suggests|say|says|agree|agrees|believe|believes|show|shows|indicate|indicates|predict|predicts|note|notes|estimate|estimates|expect|expects|warn|warns)', 'industry reports suggest', null],
    ['(?:many|some|most|several|critics|observers|commentators|analysts|skeptics|sceptics|proponents|supporters|detractors|pundits) (?:(?:people|critics|observers|commentators|analysts|researchers|scholars|developers|engineers|leaders|founders|economists|scientists) )?(?:argue|believe|claim|contend|agree|would argue|would say|would agree|have argued|have noted|have suggested|point out|say|suggest|warn)', 'many argue', null],
    ['(?:(?:widely|universally) (?:regarded|considered|recognized|recognised|acknowledged|hailed|touted|accepted|believed|thought)|generally (?:regarded|considered))(?= (?:as|to|that|the|one|a|an|by)\\b)', 'widely regarded', null],
    ['according to (?:(?:many|some|most|several|leading|top) )?(?:experts|studies|research|analysts|observers|reports|insiders|sources|critics|scientists|researchers)', 'according to experts', null],
    ["it(?: is|['’]s| has been) (?:(?:generally|commonly|often|long) )?(?:said|believed|argued|claimed|reported|thought) that", 'it is said that', null],
  ], { skip: namedSource }),
  termRule('u7-ai-vocab', 'AI vocabulary; use a plain word', [
    ['additionally', 'additionally', 'also'],
    ['crucial(?:ly)?', 'crucial', 'important'],
    ['delve[sd]?|delving', 'delve', 'look at'],
    ['enduring', 'enduring', 'lasting'],
    ['enhance[sd]?|enhancing|enhancements?', 'enhance', 'improve'],
    ['foster(?:s|ed|ing)?', 'foster', 'build'],
    ['garner(?:s|ed|ing)?', 'garner', 'get'],
    ['interplay', 'interplay', 'interaction'],
    ['intricate(?:ly)?|intricac(?:y|ies)', 'intricate', 'complex'],
    ['landscapes?(?! (?:mode|orientation|format|view))', 'landscape', 'field'],
    ['pivotal', 'pivotal', 'key'],
    ['showcase[sd]?|showcasing', 'showcase', 'show'],
    ['tapestry|tapestries', 'tapestry', 'mix'],
    ['testament', 'testament', 'evidence'],
    ['(?<!(?:an?|the|with|double|single|leading|trailing|and|or|of) )underscore[sd]?(?! (?:character|prefix|suffix|separated))|underscoring', 'underscore', 'show'],
    ['vibrant', 'vibrant', ''],
    // From no-ai-slop's list, only words with no technical sense here: robust, streamline, elevate and harness
    // stay out ("elevated permissions", "Elevation of privilege"); realm and beacon only in their figurative form.
    ['empower(?:s|ed|ing|ment)?', 'empower', 'help'],
    ['cutting(?:-| )edge', 'cutting-edge', 'new'],
    ['game(?:-| )?chang(?:er|ers|ing)', 'game changer', null],
    ['realms? of', 'realm', null],
    ['(?:shining )?beacons? of', 'beacon', null],
    ['multi-?faceted', 'multifaceted', 'complex'],
    ['meticulous', 'meticulous', 'careful'],
    ['meticulously', 'meticulous', 'carefully'],
    ['paramount', 'paramount', 'most important'],
    ['transformative', 'transformative', ''],
    ['supercharg(?:e|es|ed|ing)', 'supercharge', 'speed up'],
    ['ever-evolving', 'ever-evolving', ''],
    ['embark(?:s|ed|ing)? (?:on|upon)', 'embark on', 'start'],
  ]),
  termRule('u8-fancy-is', (t) => `fancy way to say "${t.suggestion}"`, [
    ['serv(?:e|es|ed|ing) as', 'serves as', 'is'],
    ['st(?:and|ands|ood|anding) as', 'stands as', 'is'],
    ['boast(?:s|ed|ing)?(?! about| of)', 'boasts', 'has'],
    ['(?<=(?:it|this|that|which|also|now|each|every) )(?:features|featured)(?= (?:an?|the|over|more|several|many|built-in|\\d))', 'features', 'has'],
  ]),
  {
    id: 'u9-not-just',
    run(ctx) {
      const out = [];
      for (const [re, message, guard] of [
        [NOT_JUST, '"not just X, but Y" framing; state the point directly', false],
        [IT_IS_NOT, '"not just X, but Y" framing; state the point directly', true],
        [ISNT_ITS, '"isn\'t X, it\'s Y" contrast; state Y directly', true],
      ]) {
        for (const m of ctx.masked.matchAll(re)) {
          if (mentioned(ctx, m.index, m[0].length) || (guard && CONDITION.test(sentencePrefix(ctx.masked, m.index)))) continue;
          out.push({ index: m.index, match: m[0], message, suggestion: null });
        }
      }
      return dropOverlaps(out);
    },
  },
  regexRule('u13-em-dash', /(?<!\|[ \t]*)—(?![ \t]*\|)|(?<=\S[ \t]+)(?:--|–)(?=[ \t]+\S)/g, 'dash as a connector; end the sentence or use a comma', ',', { taste: true }),
  {
    id: 'u14-colon',
    taste: true,
    run(ctx) {
      const out = [];
      const re = /(?:^|[.!?][ \t]+)(?:[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)?(?:If|When|Whenever|Unless|Unlike|Instead of|Coming from|Compared (?:to|with)|Rather than)\b[^:\n.!?*_`|]{2,80}(:)[ \t](?=[a-z])/g;
      const heads = new Set(headings(ctx).map((h) => h.line));
      ctx.lines.forEach((l, j) => {
        if (heads.has(j)) return;
        for (const m of l.matchAll(re)) {
          out.push({ index: ctx.starts[j] + m.index + m[0].lastIndexOf(':'), match: ':', message: 'colon as a mid-sentence connector; let the point stand on its own', suggestion: null });
        }
      });
      return out;
    },
  },
  {
    id: 'u16-inline-header',
    run(ctx) {
      const out = [];
      for (const it of listItems(ctx)) {
        const m = /^(\*\*|__)([^*_\n]+?)(?::\1|\1:)[ \t]*(.+)$/.exec(it.text);
        if (!m) continue;
        const label = m[2].match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length > 2 && !STOP.has(w.toLowerCase())).map(stemW) ?? [];
        const rest = m[3].match(/[\p{L}\p{N}]+/gu)?.filter((w) => !STOP.has(w.toLowerCase())).slice(0, 1).map(stemW) ?? [];
        if (label.some((w) => rest.includes(w))) {
          out.push({ index: it.start, match: `${m[1]}${m[2]}:${m[1]}`, message: 'bold label restates the line; write it as prose', suggestion: ctx.text.slice(it.start + m[0].length - m[3].length, it.start + m[0].length).trim() });
        }
      }
      return out;
    },
  },
  {
    id: 'u17-title-case',
    taste: true,
    run(ctx) {
      const out = [];
      for (const h of headings(ctx)) {
        const words = [...h.text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}']*/gu)];
        const firstAlpha = words.findIndex((w) => /\p{L}/u.test(w[0]));
        if (firstAlpha < 0) continue;
        let caps = 0;
        let lowers = 0;
        let candidates = 0;
        const fix = [];
        for (let i = firstAlpha + 1; i < words.length; i++) {
          const w = words[i][0];
          const before = h.text.slice(0, words[i].index).trimEnd();
          if (/[:—–-]$|\s-$/.test(before) && !/\w-$/.test(before)) continue; // subtitle start
          if (!/^[A-Za-z][a-z]+(?:'[a-z]+)?$/.test(w) || ctx.allow.has(w.toLowerCase())) continue;
          const small = SMALL.has(w.toLowerCase());
          const cap = /^[A-Z]/.test(w);
          if (!small) candidates++;
          if (cap) { caps++; fix.push(words[i]); } else if (!small) lowers++;
        }
        const nonSmallWords = words.length - firstAlpha;
        if (lowers === 0 && (caps >= 2 || (caps === 1 && candidates === 1 && nonSmallWords === 2))) {
          let s = h.text;
          for (const w of fix.reverse()) s = s.slice(0, w.index) + w[0].toLowerCase() + s.slice(w.index + w[0].length);
          const orig = ctx.text.slice(h.start, h.start + h.text.length);
          out.push({ index: h.start, match: orig, message: 'title-case heading; use sentence case', suggestion: s === h.text ? null : orig.replace(h.text.trim(), s.trim()) });
        }
      }
      return out;
    },
  },
  {
    id: 'u18-emoji',
    run(ctx) {
      const out = [];
      for (const part of [...headings(ctx), ...listItems(ctx)]) {
        for (const m of part.text.matchAll(EMOJI)) {
          if (NOT_EMOJI(m[0].codePointAt(0))) continue;
          out.push({ index: part.start + m.index, match: m[0], message: 'decorative emoji in a heading or bullet; remove it', suggestion: '' });
        }
      }
      return out;
    },
  },
  regexRule('u19-curly-quotes', /[‘’“”]/g, 'curly quote; use a straight quote', (m) => (/[‘’]/.test(m[0]) ? "'" : '"')),
  termRule('u20-chatbot', 'chatbot phrase; remove it', [
    ['(?:I )?hope (?:this|that) helps', 'hope this helps', ''],
    ['let me know if', 'let me know if', ''],
    ['(?:certainly|of course|absolutely|sure thing)!', 'certainly!', ''],
    ["(?:I'd|I would|I'm|I am) (?:be )?happy to help|happy to help", 'happy to help', ''],
    ['found the smoking gun', 'found the smoking gun', ''],
    ['would you like me to', 'would you like me to', ''],
    ['(?:do you )?want me to [^.?!\\n]{1,60}\\?', 'want me to …?', ''],
    ['should I (?:continue|go on|keep going)\\?', 'should I continue?', ''],
  ]),
  termRule('u22-sycophancy', 'sycophantic opener; respond directly', [
    ['(?:what an? )?(?:great|good|excellent|fantastic) (?:question|catch)(?=\s*[!.,])', 'great question', ''],
    ["you(?:'re| are) (?:absolutely|totally|completely) right", "you're absolutely right", ''],
  ]),
  termRule('u23-filler', (t) => (t.suggestion ? `filler phrase; use "${t.suggestion}"` : 'filler phrase; delete it'), [
    ['in order to', 'in order to', 'to'],
    ['(?:due|owing) to the fact that', 'due to the fact that', 'because'],
    ['(?:in spite of|despite) the fact that', 'despite the fact that', 'although'],
    ["(?:it is|it's) (?:important|worth) (?:to note|noting) that|it should be noted that", 'it is important to note that', ''],
    ['at this point in time', 'at this point in time', 'now'],
    ['for the purpose of', 'for the purpose of', 'for'],
    ['(?:has|have) the ability to', 'has the ability to', 'can'],
    ['at the end of the day', 'at the end of the day', ''],
    ['that being said[,:]?', 'that being said', ''],
    ['when it comes to', 'when it comes to', 'for'],
    ['at its core', 'at its core', ''],
    ["in today['’]s (?:(?:fast-paced|digital|modern|ever-changing|rapidly changing|connected|competitive) )?(?:world|age|era|landscape|economy|market|environment|climate|society)", "in today's world", ''],
    ['in the (?:age|era) of', 'in the age of', null],
    // Opening a sentence only: mid-sentence, "truth" and "in terms of" are often the literal noun and the exact
    // sense ("express X in terms of Y"); after a comparing adjective, "in terms of" is filler ("fast in terms of").
    [`${SENTENCE_START}(?:(?:but|and|yet|so) )?the (?:reality|truth) is(?!\\s+(?:in|on|at|stored|kept|held|written|recorded|out|somewhere|elsewhere)\\b)`, 'the truth is', ''],
    ['the fact of the matter is', 'the fact of the matter is', ''],
    ["(?<!(?:keep|keeps|kept|keeping|is|are|was|were|be|been|am|and|of|start|starts|started|moving|move|moves) )going forward(?=\\s*(?:[,.;:!?)]|\\n|$))", 'going forward', ''],
    [`${SENTENCE_START}in terms of|(?<=(?:fast|faster|slow|slower|good|better|bad|worse|cheap|cheaper|costly|expensive|big|bigger|small|smaller|large|larger|simple|simpler|easy|easier|hard|harder|similar|different|comparable|equivalent|superior|inferior|ahead|behind|efficient|strong|stronger|weak|weaker|light|lighter|heavy|heavier|safe|safer|risky|riskier) )in terms of`, 'in terms of', 'for'],
    ['(?:with|in) regards? to', 'with regard to', 'about'],
  ]),
  regexRule('u24-hedges',
    new RegExp(`${B0}(?:${HEDGE}(?:[ \\t]+[\\p{L}']+){0,2}?\\s+${HEDGE}|it\\s+(?:could|might|can)\\s+(?:\\w+\\s+)?be\\s+(?:argued|said))${B1}`, 'giu'),
    'stacked hedges; keep one ("may") or state it', 'may'),
  termRule('u25-generic-conclusion', 'generic conclusion; state the specific plan or fact', [
    ['the future (?:looks|is) (?:bright|promising)', 'the future looks bright', null],
    ['the possibilities are endless', 'the possibilities are endless', null],
    ['only time will tell', 'only time will tell', null],
    ['exciting times (?:lie )?ahead', 'exciting times ahead', null],
    ["the sky's the limit", "the sky's the limit", null],
    ['a step in the right direction', 'a step in the right direction', null],
    ['stay tuned', 'stay tuned', null],
    ['(?:is|this is) (?:just|only) the beginning', 'just the beginning', null],
    ['(?<=^|[.!?]\\s+|\\n)in conclusion', 'in conclusion', ''],
  ]),
  termRule('u26-metaphor-noun', 'abstract metaphor noun; pick the concrete word', [
    ['substrates?', 'substrate', 'base'],
    ['wedg(?:e|es|ed|ing)', 'wedge', 'add'],
    ['vectors?', 'vector', 'way'],
    ['locus', 'locus', 'place'],
    ['vantage(?: points?)?', 'vantage', 'view'],
    ['nexus', 'nexus', 'link'],
    ['primitives|(?<=(?:an?|the|this|that|new|core|basic) )primitive(?! (?:types?|values?|data|obsession|operations?|roots?))', 'primitive', 'building block'],
    ['(?<!test )harness(?:es)?', 'harness', null],
    ['(?<=(?:API|api|interface|public|config|configuration|feature|command|tool|product) )surface', 'surface', null],
    ['bedrock', 'bedrock', 'base'],
    ['scaffolding', 'scaffolding', 'setup'],
    ['modalit(?:y|ies)', 'modality', 'mode'],
    ['paradigms?', 'paradigm', 'model'],
    ['gold[- ]plat(?:e|ed|ing)', 'gold-plating', 'more than the job needs'],
    ['ratchet(?:s|ed|ing)?', 'ratchet', 'a limit that only tightens'],
    ['evacuat(?:e|es|ed|ing)', 'evacuate', 'move out'],
    ['endgame', 'endgame', 'the last phase'],
    ['north stars?', 'north star', 'goal'],
    ['flywheels?', 'flywheel', 'loop'],
  ]),
  regexRule('u29-passive-by',
    new RegExp(`${B0}(?:is|are|was|were|be|been|being)\\s+(?:(?:\\w+ly|not|also|then|now|always|never|only|often)\\s+)?${PARTICIPLE}\\s+by\\s+(?!${NOT_ACTOR}${B1}|\\p{L}+ing${B1})[\\p{L}\\p{N}]+`, 'giu'),
    'passive voice with a named actor; make the actor the subject'),
  termRule('u31-plain-word', (t) => `use the plain word "${t.suggestion}"`, [
    ['utili[sz](?:e|es|ed|ing|ation)', 'utilize', 'use'],
    ['leverag(?:e|es|ed|ing)', 'leverage', 'use'],
    ['facilitat(?:e|es|ed|ing)', 'facilitate', 'help'],
    ['numerous', 'numerous', 'many'],
    ['in the event that', 'in the event that', 'if'],
    ['prior to', 'prior to', 'before'],
    ['commenc(?:e|es|ed|ing)', 'commence', 'start'],
    ['ascertain(?:s|ed|ing)?', 'ascertain', 'find out'],
  ]),
  // No-ai-slop patterns with no unslop number start at u34.
  termRule('u34-throat-clearing', 'throat-clearing opener; cut it and state the point', [
    ["here['’]s the (?:thing|deal|kicker|truth)[:,.!—]?|here is the (?:thing|deal|kicker|truth)(?:[:,.!—])", "here's the thing", ''],
    ['let me be (?:clear|honest|blunt|frank|direct)[:,.!—]?', 'let me be clear', ''],
    ["let['’]s be (?:clear|honest|real|frank)[:,.!—]?", "let's be honest", ''],
    ["I['’]ll be (?:honest|blunt|frank|real)(?: with you)?[:,.!—]", "I'll be honest", ''],
    ['the (?:uncomfortable|hard|harsh|brutal|honest|inconvenient|ugly|sad|simple) truth is', 'the uncomfortable truth is', null],
    ["let['’]s (?:dive|jump) (?:right )?in[:,.!—]?|let['’]s get into it[:,.!—]?", "let's dive in", ''],
    ["let['’]s (?:dive|jump) (?:right )?into|let['’]s (?:deep[- ]dive|unpack|break (?:it|this|that) down)", "let's dive into", null],
    [`${SENTENCE_START}in this (?:article|blog post|post|piece|essay|newsletter)`, 'in this article', null],
    ['make no mistake[:,.!—]?', 'make no mistake', ''],
    ["let['’]s face it[:,.!—]?", "let's face it", ''],
    ['without further ado[:,.!—]?', 'without further ado', ''],
    ['let me explain[:.!—]', 'let me explain', ''],
  ]),
  termRule('u35-fake-insight', 'fake-insight setup; cut the setup and state the claim', [
    ["what (?:nobody|no one|few people|they don['’]t|most people don['’]t) (?:tells?|will tell) you", 'what nobody tells you', null],
    ['(?:nobody|no one) (?:tells|told|warns|warned) you|(?:nobody|no one)(?: is)? talk(?:s|ing) about (?:this|it|that)', 'nobody tells you', null],
    ["what (?:most|many) (?:people|teams|developers|founders|companies|engineers|leaders|managers|writers|creators|marketers|folks) (?:get wrong|miss|overlook|don['’]t (?:realize|realise|understand|get|know|see)|fail to (?:see|understand|realize|realise|grasp)|misunderstand|forget)", 'what most people get wrong', null],
    ["(?:this is the|that['’]s the|here['’]s the|the) part (?:that )?(?:everyone|everybody|most people|nobody|no one|people|most teams) (?:misses|miss|skips|skip|forgets|forget|overlooks|overlook|gets wrong|get wrong|ignores|ignore|doesn['’]t (?:see|get|talk about))", 'the part everyone misses', null],
    ["(?:most|many) people (?:don['’]t|do not|never) (?:realize|realise|notice|understand|know)", "most people don't realize", null],
    ['the (?:secret|trick) (?:nobody|no one|few people) (?:talks about|tells you|mentions|knows)', 'the secret nobody talks about', null],
  ]),
  termRule('u36-metadiscourse', 'tells the reader what to notice; cut it, or show why with a fact', [
    ['as you can (?:see|tell|imagine)[,:]?', 'as you can see', ''],
    ['the (?:key|main|big|important|real|crucial|central|critical) (?:point|takeaway|insight|lesson|thing to (?:remember|understand|note|know|notice)) (?:here )?is', 'the key point is', null],
    ['(?<!(?:when|whenever|if|whether|where|why|unless|how) )th(?:is|at) (?:distinction|difference|nuance|subtlety) (?:really )?(?:matters|is (?:important|crucial|key|critical|significant))', 'this distinction matters', null],
    ['(?:that|this) last (?:part|bit|point|line|sentence|one) matters', 'that last part matters', null],
    ["matters more than (?:it sounds|it seems|it looks|you(?:['’]d| would| might) (?:think|expect)|(?:most )?people (?:think|realize|realise))", 'matters more than it sounds', null],
    ["here['’]s why (?:this|that|it) matters", "here's why this matters", null],
    ["(?:this|here) is (?:where|when) (?:it|things) gets? (?:interesting|tricky|good|fun|weird|real)|here['’]s where (?:it|things) gets? (?:interesting|tricky|good|fun|weird|real)", 'this is where it gets interesting', null],
    ["(?:it['’]s|it is) worth (?:pausing|dwelling|sitting) (?:on|with|here)", "it's worth pausing on", null],
  ]),
  termRule('u37-rhetorical-setup', 'rhetorical setup; drop it and make the point', [
    ['what if I (?:told|tell) you', 'what if I told you', null],
    [`${SENTENCE_START}(?:(?:so|now|but|and) )?think about (?:it|that|this)(?=\\s*(?:[:.!?—]|\\n|$))`, 'think about it', ''],
    ['if you think about it[,:]?', 'if you think about it', ''],
    ['plot twist[:!.,—]', 'plot twist', ''],
    ['spoiler(?: alert)?[:!]', 'spoiler alert', ''],
    ['guess what[?!:.,]', 'guess what', ''],
    ['let that sink in[.!]?', 'let that sink in', ''],
    ['read that again[.!]?', 'read that again', ''],
    [`${SENTENCE_START}sounds? familiar\\?`, 'sound familiar?', ''],
    [`${SENTENCE_START}(?:(?:and|so|but) )?the (?:result|answer|kicker|catch|twist|best part|worst part|crazy part|wild part|secret|problem|real problem|reason|outcome|verdict|takeaway|lesson|upshot|punchline|difference|fix|cost)\\?(?=\\s+\\S)`, 'the result?', null],
    [`${SENTENCE_START}(?:why|how)\\?(?=\\s+(?:because|simple|easy)\\b)`, 'why? because', null],
    ['want to know (?:the secret|the best part|why|how|what happened)\\?', 'want to know why?', null],
  ]),
  termRule('u38-puffery', 'importance puffery; state the fact and let the reader judge', PUFFERY, {
    // After a comma, a participle phrase ("..., marking a pivotal moment") is u3's to report.
    skip: (ctx, m) => /^\p{L}+ing(?![\p{L}])/u.test(m[0]) && /,\s*$/.test(ctx.masked.slice(Math.max(0, m.index - 8), m.index)),
  }),
  {
    id: 'u39-negative-listing',
    run(ctx) {
      const re = new RegExp(`${SENTENCE_START}not\\s+(?:a|an)\\s[^.!?\\n]{1,60}[.!?]["')’”]*\\s+not\\s+(?:a|an)\\s[^.!?\\n]{1,60}[.!?]`, 'giu');
      return [...ctx.masked.matchAll(re)].filter((m) => !mentioned(ctx, m.index, m[0].length))
        .map((m) => ({ index: m.index, match: m[0], message: 'negative listing ("Not a X. Not a Y."); say what it is', suggestion: null }));
    },
  },
  {
    id: 'u40-recap-ending',
    run(ctx) {
      // Blocks of lines between blank lines; a piece needs at least three besides headings to have an ending.
      const heads = new Set(headings(ctx).map((h) => h.line));
      const blocks = [];
      let open = false;
      ctx.lines.forEach((l, j) => {
        if (!l.trim()) { open = false; return; }
        if (heads.has(j) || (heads.has(j - 1) && SETEXT_UNDER.test(l))) { blocks.push({ kind: 'heading', line: j }); open = false; return; }
        if (!open) blocks.push({ kind: LIST.test(l) ? 'list' : /^\s*\|/.test(l) ? 'table' : 'para', line: j });
        open = true;
      });
      // The opening pattern below can't match a heading, a list item, or a table row, so any block can be last.
      const last = blocks[blocks.length - 1];
      if (!last || blocks.filter((b) => b.kind !== 'heading').length < 3) return [];
      const m = /^([ \t>]*(?:\*\*|__|\*|_)?)(in summary|to summari[sz]e|to sum up|in sum|ultimately|overall|all in all|in the end|in short|in closing|all things considered|in a nutshell|in essence)(?:\*\*|__|\*|_)?\s*,/i.exec(ctx.lines[last.line]);
      if (!m) return [];
      return [{ index: ctx.starts[last.line] + m[1].length, match: m[2], message: 'recap opening the last paragraph; end on the last concrete point instead', suggestion: null }];
    },
  },
  termRule('u41-straw-defence', 'a defence against an objection nobody raised; cut it, or state the option the reader would weigh', [
    ["I(?:'m|’m| am) not saying", "I'm not saying", ''],
    ["don(?:'t|’t) get me wrong", "don't get me wrong", ''],
    ["this (?:is not|isn't|isn’t) to say", "this isn't to say", ''],
    ['(?:a|one) tempting (?:approach|option|fix|solution) (?:would be|is)', 'a tempting approach would be', null],
    ['one might be tempted to', 'one might be tempted to', null],
  ]),
  termRule('u42-knowledge-limit', 'a guess dressed as a knowledge limit; ask for the fact or cut the sentence', [
    ['as of my (?:last|latest) (?:training|knowledge)(?: (?:update|cutoff|cut-off))?', 'as of my last training', ''],
    ['(?:specific )?details (?:about [^.,\\n]{1,40} )?(?:are|remain) (?:limited|scarce|not (?:(?:widely|extensively|publicly) )?(?:documented|available))', 'details are limited', null],
    ['based on (?:the )?available (?:information|sources)', 'based on available information', null],
    ['maintains a low (?:public )?profile', 'maintains a low profile', null],
  ]),
  termRule('u43-about-the-document', 'a sentence about the document; say the thing itself, or cut it', [
    ['(?:the|this) (?:table|list|section|page|document|article|guide|post) below (?:compares|shows|lists|outlines|covers|summari[sz]es)', 'the table below compares', null],
    ['this (?:section|document|page|guide|article|post) (?:is organi[sz]ed|explores|walks you through|will (?:explore|cover|show|walk))', 'this section explores', null],
  ]),
  termRule('u45-brochure', 'brochure word; name the concrete thing instead', [
    ['nestled', 'nestled', null],
    ['in the heart of', 'in the heart of', null],
    ['breathtaking', 'breathtaking', null],
    ['must-(?:see|visit)', 'must-see', null],
    ['rich (?:cultural )?(?:heritage|tapestry)', 'rich heritage', null],
    ['diverse array', 'diverse array', null],
  ]),
  // From SlopMonster's catalogue (MIT, Jack Roberts): marketing-copy constructions. Swept over the 12,775 Markdown
  // files under external/, these rules and "that being said" fire 4 times, all real tells. The common words that
  // catalogue also lists (robust, unlock, journey, solution, comprehensive) hit hundreds of files and stay unflagged
  // (see MUST_NOT_FIRE "words left out of the list").
  termRule('u46-marketing-setup', 'marketing construction; name the one reader and what the thing does', [
    ["whether you['’]re an? [\\p{L}-]+(?: [\\p{L}-]+){0,2} or (?:an? )?[\\p{L}-]+", "whether you're a beginner or a pro", null],
    ["that['’]s where [^.!?\\n]{1,40}? comes in", "that's where X comes in", null],
    ['say goodbye to(?! the (?:user|caller|customer|client|player|guest)\\b)', 'say goodbye to', null],
    ['imagine (?:a|the) (?:world|future|day|time|scenario) (?:where|in which|when)', 'imagine a world where', null],
    ['more than just(?! (?:one|two|three|a few|\\d))', 'more than just', null],
    ['help(?:s|ed|ing)? you to\\b', 'helps you to', 'helps you'],
  ]),
];
export const RULE_IDS = RULES.map((r) => r.id);
const TASTE = RULES.filter((r) => r.taste).map((r) => r.id);

// ---------- config ----------

class RunError extends Error {}

export function parseConfig(raw, where) {
  let c;
  try { c = JSON.parse(raw); } catch (e) { throw new RunError(`${where}: not valid JSON (${e.message})`); }
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new RunError(`${where}: must be a JSON object`);
  for (const k of Object.keys(c)) if (!['disable', 'words'].includes(k)) throw new RunError(`${where}: unknown key "${k}"`);
  const strings = (v, name) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) throw new RunError(`${where}: ${name} must be an array of non-empty strings`);
    return v;
  };
  const disable = strings(c.disable, 'disable');
  for (const id of disable) if (!RULE_IDS.includes(id)) throw new RunError(`${where}: unknown rule "${id}" in disable (known: ${RULE_IDS.join(', ')})`);
  const words = c.words ?? {};
  if (typeof words !== 'object' || Array.isArray(words)) throw new RunError(`${where}: words must be an object`);
  for (const k of Object.keys(words)) if (!['allow', 'deny'].includes(k)) throw new RunError(`${where}: unknown key "words.${k}"`);
  return { disable: new Set(disable), allow: new Set(strings(words.allow, 'words.allow').map((w) => w.toLowerCase())), deny: strings(words.deny, 'words.deny') };
}

const DEFAULT_CONFIG = { disable: new Set(), allow: new Set(), deny: [] };

// ---------- linting ----------

export function lintText(input, config = DEFAULT_CONFIG) {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const masked = maskText(text);
  const lines = masked.split('\n');
  const starts = [];
  let off = 0;
  for (const l of lines) { starts.push(off); off += l.length + 1; }
  const ctx = { text, masked, lines, starts, allow: config.allow };
  const where = (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, column: index - starts[lo] + 1 };
  };
  const rules = [...RULES];
  if (config.deny.length) {
    rules.push(termRule('u7-ai-vocab', 'word denied by config', config.deny.map((w) => [escapeRe(w), w.toLowerCase(), null])));
  }
  const findings = [];
  for (const rule of rules) {
    if (config.disable.has(rule.id)) continue;
    for (const f of rule.run(ctx)) {
      if (config.allow.has(f.match.toLowerCase()) || (f.key && config.allow.has(f.key))) continue;
      let suggestion = f.suggestion ?? null;
      if (suggestion && /^[A-Z]/.test(f.match) && rule.id !== 'u16-inline-header' && rule.id !== 'u17-title-case') suggestion = suggestion[0].toUpperCase() + suggestion.slice(1);
      findings.push({ ...where(f.index), rule: rule.id, match: text.slice(f.index, f.index + f.match.length), message: f.message, suggestion });
    }
  }
  return findings.sort((x, y) => x.line - y.line || x.column - y.column || x.rule.localeCompare(y.rule));
}

// ---------- inputs ----------

const SKIP_DIRS = new Set(['node_modules', '.git', 'external']);

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out); } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p);
  }
}

function expand(args) {
  const files = [];
  for (const a of args) {
    if (a === '-') { files.push('-'); continue; }
    if (/[*?[\]{}]/.test(a)) {
      const hits = globSync(a).filter((p) => { try { return statSync(p).isFile(); } catch { return false; } });
      if (!hits.length) throw new RunError(`${a}: glob matched no files`);
      files.push(...hits.sort());
      continue;
    }
    let st;
    try { st = statSync(a); } catch { throw new RunError(`${a}: no such file or directory`); }
    if (st.isDirectory()) { const found = []; walk(a, found); files.push(...found.sort()); } else files.push(a);
  }
  return [...new Set(files)];
}

const configCache = new Map();
function configFor(dir) {
  dir = resolve(dir);
  if (configCache.has(dir)) return configCache.get(dir);
  const p = join(dir, '.prose-lint.json');
  let c;
  if (existsSync(p)) {
    let raw;
    try { raw = readFileSync(p, 'utf8'); } catch (e) { throw new RunError(`${p}: unreadable (${e.code ?? e.message})`); }
    c = parseConfig(raw, p);
  } else {
    const up = dirname(dir);
    c = up === dir ? DEFAULT_CONFIG : configFor(up);
  }
  configCache.set(dir, c);
  return c;
}

function main(argv) {
  const args = [];
  let configPath = null;
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') quiet = true;
    else if (a === '--config') { configPath = argv[++i]; if (!configPath) throw new RunError('--config needs a file'); }
    else if (a.startsWith('--')) throw new RunError(`unknown option ${a}`);
    else args.push(a);
  }
  if (!args.length) throw new RunError('no input: give files, directories, globs, or - for stdin');
  let fixed = null;
  if (configPath) {
    let raw;
    try { raw = readFileSync(configPath, 'utf8'); } catch (e) { throw new RunError(`${configPath}: unreadable (${e.code ?? e.message})`); }
    fixed = parseConfig(raw, configPath);
  }
  const files = expand(args);
  if (!files.length) throw new RunError(`no input: no *.md files under ${args.join(', ')}`);
  const findings = [];
  for (const f of files) {
    let text;
    try { text = f === '-' ? readFileSync(0, 'utf8') : readFileSync(f, 'utf8'); } catch (e) { throw new RunError(`${f}: unreadable (${e.code ?? e.message})`); }
    const config = fixed ?? configFor(f === '-' ? process.cwd() : dirname(f));
    const name = f === '-' ? '<stdin>' : relative(process.cwd(), f).replace(/\\/g, '/') || basename(f);
    for (const x of lintText(text, config)) findings.push({ file: name, ...x });
  }
  const counts = {};
  for (const x of findings) counts[x.rule] = (counts[x.rule] ?? 0) + 1;
  if (!quiet) {
    for (const x of findings) {
      const fix = x.suggestion === null ? '' : x.suggestion === '' ? '  -> (delete)' : `  -> "${x.suggestion}"`;
      console.error(`${x.file}:${x.line}:${x.column}  ${x.rule}  "${x.match}"  ${x.message}${fix}`);
    }
    const hit = new Set(findings.map((x) => x.file)).size;
    console.error(`lint-prose: ${findings.length} finding(s) in ${hit} of ${files.length} file(s)`);
    for (const [r, n] of Object.entries(counts).sort((p, q) => q[1] - p[1])) console.error(`  ${r}: ${n}${TASTE.includes(r) ? ' (taste)' : ''}`);
  }
  process.stdout.write(JSON.stringify({ status: findings.length ? 'findings' : 'clean', files: files.length, counts, findings }) + '\n');
  return findings.length ? 1 : 0;
}

// ---------- selftest ----------

// One planted sample per rule, each ignored context holding trigger words, config and exit-code checks.
const SAMPLES = {
  'u7-ai-vocab': 'We delve into the details.',
  'u8-fancy-is': 'The dashboard serves as a hub.',
  'u9-not-just': 'It is not just fast, but also safe.',
  'u13-em-dash': 'The build passed — then failed.',
  'u14-colon': 'If you come from Make: instead of targets, you write tasks.',
  'u16-inline-header': '- **Performance:** Performance improved by 20%.',
  'u17-title-case': '## Getting Started With The Tool',
  'u18-emoji': '## 🚀 Launch plan',
  'u19-curly-quotes': 'He said “hello”.',
  'u20-chatbot': 'I hope this helps.',
  'u22-sycophancy': 'Great question! Here is the answer.',
  'u23-filler': 'Run it in order to build.',
  'u24-hedges': 'This could potentially break.',
  'u25-generic-conclusion': 'The future looks bright.',
  'u26-metaphor-noun': 'This is the substrate for everything.',
  'u29-passive-by': 'The file is parsed by the loader.',
  'u31-plain-word': 'We utilize caching.',
  'u3-superficial-ing': "The launch adds file search, highlighting the team's commitment to better workflows.",
  'u5-vague-attribution': 'Studies show that remote teams ship faster.',
  'u34-throat-clearing': "Here's the thing: nobody reads docs.",
  'u35-fake-insight': "Here's what nobody tells you about retries.",
  'u36-metadiscourse': 'As you can see, the output lists every file.',
  'u37-rhetorical-setup': 'What if I told you tests could write themselves?',
  'u38-puffery': 'The cache plays a vital role in startup.',
  'u39-negative-listing': 'Not a chatbot. Not a copilot. A teammate.',
  'u40-recap-ending': 'The parser reads the file.\n\nThe writer saves it.\n\nThe CLI prints a report.\n\nUltimately, the tool saves time.\n',
  'u41-straw-defence': "I'm not saying cron is bad, but the job needs a queue.",
  'u42-knowledge-limit': 'Details about the retention policy are not documented, so it probably keeps files for a month.',
  'u43-about-the-document': 'The table below compares both options.',
  'u45-brochure': 'The office is nestled in the old town.',
  'u46-marketing-setup': "Whether you're a beginner or a pro, this guide has you covered.",
};
const TRIGGERS = "We delve and utilize — “quotes” in order to. Great question! Here's the thing: studies show it, underscoring the need. Not a bug. Not a toy.";
const IGNORED = {
  'backtick fence': `Clean text.\n\n\`\`\`md\n${TRIGGERS}\n## Getting Started Now\n\`\`\`\n`,
  'tilde fence': `~~~\n${TRIGGERS}\n~~~\nClean text.\n`,
  'long fence holding a shorter one': `\`\`\`\`\n\`\`\`\n${TRIGGERS}\n\`\`\`\n${TRIGGERS}\n\`\`\`\`\n`,
  'unclosed fence': `Clean text.\n\n\`\`\`\n${TRIGGERS}\n`,
  'inline code': `Run \`utilize — delve\` and \`\`a \` delve\`\` now.\n`,
  URL: 'See https://example.com/delve-utilize—x and <https://example.com/leverage> for more.\n',
  'link target and reference': '[the docs](https://example.com/delve "utilize it") and [ref][delve-label].\n\n[delve-label]: https://example.com/utilize\n',
  'HTML comment': `<!-- ${TRIGGERS}\n${TRIGGERS} -->\nClean text.\n`,
  'HTML tag attributes': '<a href="delve.html" title="utilize">Clean</a>\n',
  frontmatter: `---\ntitle: ${TRIGGERS}\ndescription: “Great question”\n---\nClean text.\n`,
};
const MUST_NOT_FIRE = {
  'sentence-case heading': ['## Getting started', 'u17-title-case'],
  'bold lead-in with new detail': ['- **Schema in TypeScript.** Tables live in one file.', 'u16-inline-header'],
  'label that adds detail': ['- **Speed:** Builds finish in 3 s.', 'u16-inline-header'],
  'noun "features"': ['New features are listed below.', 'u8-fancy-is'],
  'hyphenated flag': ['Pass --json to get machine output.', 'u13-em-dash'],
  'passive "by default"': ['The cache is enabled by default.', 'u29-passive-by'],
  'test harness': ['Run the test harness first.', 'u26-metaphor-noun'],
  'passive "by <gerund>" (means, not actor)': ['It is checked by running the suite.', 'u29-passive-by'],
  'quoted mention of a phrase': ['Never open with "Great question!" in a reply.', 'u22-sycophancy'],
  'em dash as an empty table cell': ['| a | — |', 'u13-em-dash'],
  'colon before inline code': ['If it is off, switch it on: `npm run on` does it.', 'u14-colon'],
  'label a later word echoes': ['- **Judge cache**: verdicts are cached by input.', 'u16-inline-header'],
  // Look-alikes of the no-ai-slop patterns: literal senses, named sources, quoted examples, code.
  '"-ing" clause with a literal object': ['The editor underlines the error, highlighting the current line.', 'u3-superficial-ing'],
  '"reflecting" a concrete state': ['The table re-renders, reflecting the new state.', 'u3-superficial-ing'],
  '"-ing" phrase with no comma': ["Highlighting the importance of tests is the reviewer's job.", 'u3-superficial-ing'],
  '"ensuring" clause (not listed)': ['Run the tests, ensuring the cache is warm.', 'u3-superficial-ing'],
  '"marking" a concrete state': ['The job retries, marking the task as failed after three tries.', 'u3-superficial-ing'],
  'quoted "-ing" example sentence': ['Cut clauses like "The launch adds file search, highlighting the team\'s commitment to better workflows" from drafts.', 'u3-superficial-ing'],
  'attribution with a linked citation': ['Studies show a 20% drop in errors ([Lee, 2021](https://example.com/lee)).', 'u5-vague-attribution'],
  'attribution with an et al. citation': ['Research suggests the effect is real (Lee et al., 2021).', 'u5-vague-attribution'],
  'attribution with a footnote': ['Studies show the effect holds.[^1]', 'u5-vague-attribution'],
  'attribution to our own research': ['Our research shows the p95 fell to 40 ms.', 'u5-vague-attribution'],
  'attribution to a named institution': ['A 2023 Stanford study found the same thing.', 'u5-vague-attribution'],
  'quoted attribution phrases': ['Flag "Experts agree" and "studies show" when no source follows.', 'u5-vague-attribution'],
  'research as a process': ['Add new todos as research reveals more paths, and let competitor research confirm the URLs.', 'u5-vague-attribution'],
  'a named source two words back': ["Anthropic's own research shows the drop, and CodeScene peer-reviewed research shows it too.", 'u5-vague-attribution'],
  '"widely accepted" as an adjective': ['Follow widely accepted industry practices.', 'u5-vague-attribution'],
  'a case study': ['This case study demonstrates how the fuzzer found three CVEs.', 'u5-vague-attribution'],
  'curly-quoted mention': ['Cut “What nobody tells you is” openers.', 'u35-fake-insight'],
  '"that distinction matters" as a condition': ['Ask for release history when that distinction matters.', 'u36-metadiscourse'],
  'imperative "Emphasize the importance"': ['Emphasize the importance of tests in reviews.', 'u38-puffery'],
  'realm as a technical term': ['The Kerberos realm is EXAMPLE.COM.', 'u7-ai-vocab'],
  'beacon as a technical term': ['Call sendBeacon on unload; the beacon fires once.', 'u7-ai-vocab'],
  'words left out of the list': ['Run it with elevated permissions and a robust parser, then streamline the harness.', 'u7-ai-vocab'],
  'conditional "isn\'t X, it\'s Y"': ["If the check isn't green, it's not done.", 'u9-not-just'],
  'second clause negated': ["The file isn't cached, it's not on disk either.", 'u9-not-just'],
  'negation inside an opening condition': ["If the value isn't set, it's treated as zero.", 'u9-not-just'],
  '"isn\'t X. That\'s fine."': ["The key isn't set. That's fine: the default applies.", 'u9-not-just'],
  'quoted binary contrast': ['Rewrite "It isn\'t a bug, it\'s a feature" as a plain claim.', 'u9-not-just'],
  '"in terms of" in its exact sense': ['The function is defined in terms of the public API.', 'u23-filler'],
  'literal "going forward"': ['The cursor keeps going forward.', 'u23-filler'],
  'literal "the truth is"': ['The truth is stored in the database.', 'u23-filler'],
  '"in terms of" after a verb or noun': ['The skills speak in terms of five roles; explain why it is wrong in terms of the spec.', 'u23-filler'],
  '"the truth is" with truth as a noun, mid-sentence': ['A check runs when the truth is stale.', 'u23-filler'],
  '"here is the thing" as a literal noun': ['Here is the thing you need: a token.', 'u34-throat-clearing'],
  '"I\'ll be honest" as a promise': ["I'll be honest with the numbers in the report.", 'u34-throat-clearing'],
  '"in this article" mid-sentence': ['See the table in this article for the limits.', 'u34-throat-clearing'],
  'quoted throat-clearing example': ['A post opening "Here\'s the thing: nobody reads docs" reads as AI.', 'u34-throat-clearing'],
  '"the part everyone uses"': ['The part everyone uses is the CLI.', 'u35-fake-insight'],
  '"most people don\'t need"': ["Most people don't need this flag.", 'u35-fake-insight'],
  '"you can see" as a plain statement': ['You can see the output in the log.', 'u36-metadiscourse'],
  '"the key is" (a key)': ['The key is stored in the vault.', 'u36-metadiscourse'],
  '"this distinction is"': ['This distinction is covered in the FAQ.', 'u36-metadiscourse'],
  '"think about it as"': ['Think about it as a queue.', 'u37-rhetorical-setup'],
  '"the result is"': ['The result is written to stdout.', 'u37-rhetorical-setup'],
  'a real question': ['What if the token expires? The client retries.', 'u37-rhetorical-setup'],
  '"plays a role" with no puffery adjective': ['The cache plays a role in startup.', 'u38-puffery'],
  '"mark the milestone" as an action': ['Mark the milestone as done, then mark a new milestone in the tracker.', 'u38-puffery'],
  'puffery clause after a comma (u3 reports it)': ['Version 2 is out, marking a pivotal moment for the project.', 'u38-puffery'],
  'one "Not a" sentence': ['Not a problem.', 'u39-negative-listing'],
  '"Not a X. It is Y."': ['Not a bug. It is a feature.', 'u39-negative-listing'],
  '"Not a" list items': ['- Not a replacement for make.\n- Not a build tool.', 'u39-negative-listing'],
  '"Overall" before the last paragraph': ['Overall, the build takes 3 minutes.\n\nThe parser reads the file.\n\nThe writer saves it.\n\nThe CLI prints a report.\n', 'u40-recap-ending'],
  'a short reply opening "Overall"': ['Overall, looks good.\n', 'u40-recap-ending'],
  'a heading as the last block': ['The parser reads the file.\n\nThe writer saves it.\n\nThe CLI prints a report.\n\nOverall, what comes next\n------------------------\n', 'u40-recap-ending'],
  '"Overall:" as a label in the last paragraph': ['The parser reads the file.\n\nThe writer saves it.\n\nThe CLI prints a report.\n\n**Overall:** CLI application with plugins.\n', 'u40-recap-ending'],
  '"Overall" in the last paragraph but not first': ['The parser reads the file.\n\nThe writer saves it.\n\nThe CLI prints a report.\n\nThe build takes 3 minutes overall.\n', 'u40-recap-ending'],
  '"whether you\'re" with a condition, not two people': ["Whether you're running locally or in CI, set the flag.", 'u46-marketing-setup'],
  '"whether you\'re" with a verb pair': ["Whether you're building or testing, use the same command.", 'u46-marketing-setup'],
  '"imagine a" with a queue': ['Imagine a queue where each job waits for the one before it.', 'u46-marketing-setup'],
  '"say goodbye to the user"': ['On hangup, say goodbye to the caller and close the session.', 'u46-marketing-setup'],
  '"more than just N"': ['The job reads more than just one file; it reads three.', 'u46-marketing-setup'],
  '"help you" without "to"': ['This flag helps you find the slow query.', 'u46-marketing-setup'],
  '"that is where" in a plain sentence': ['The log is where the error shows up.', 'u46-marketing-setup'],
  '"that being said" inside a quoted example': ['A post opening "That being said, we shipped" reads as AI.', 'u23-filler'],
};
// Planted positives beyond the one sample per rule: every phrase family a rule covers must fire.
const MUST_FIRE = {
  'u3 "underscoring the need"': ['Revenue rose 20%, underscoring the need for more staff.', 'u3-superficial-ing'],
  'u3 "reflecting a broader shift"': ['The update ships dark mode, reflecting a broader shift toward accessibility.', 'u3-superficial-ing'],
  'u3 "showcasing its ability"': ['The team shipped on time, showcasing its ability to execute.', 'u3-superficial-ing'],
  'u3 "emphasising how seriously"': ['The release adds an API, emphasising how seriously we take developers.', 'u3-superficial-ing'],
  'u3 "symbolizing"': ['The logo was redrawn, symbolizing a new era.', 'u3-superficial-ing'],
  'u3 "marking a pivotal moment"': ['Version 2 is out, marking a pivotal moment for the project.', 'u3-superficial-ing'],
  'u3 "cementing its position"': ['The deal closed, cementing its position as the market leader.', 'u3-superficial-ing'],
  'u5 "experts agree"': ['Experts agree the old API was too slow.', 'u5-vague-attribution'],
  'u5 "research suggests"': ['Research suggests pairing cuts defects.', 'u5-vague-attribution'],
  'u5 "industry reports suggest"': ['Industry reports suggest adoption is rising.', 'u5-vague-attribution'],
  'u5 "many argue"': ['Many argue that tabs beat spaces.', 'u5-vague-attribution'],
  'u5 "some critics argue"': ['Some critics argue the syntax is noisy.', 'u5-vague-attribution'],
  'u5 "widely regarded as"': ['Rust is widely regarded as the safest choice.', 'u5-vague-attribution'],
  'u5 "widely regarded" after a named subject': ['Today Python is widely regarded as the easiest first language.', 'u5-vague-attribution'],
  'u5 "according to experts"': ['According to experts, the fix is safe.', 'u5-vague-attribution'],
  'u5 "a recent study found"': ['A recent study found that most builds are slow.', 'u5-vague-attribution'],
  'u5 "it is widely believed"': ['It is widely believed that caching fixes everything.', 'u5-vague-attribution'],
  'u7 empower': ['This will empower teams.', 'u7-ai-vocab'],
  'u7 cutting-edge': ['A cutting-edge tool.', 'u7-ai-vocab'],
  'u7 game changer': ['It is a game changer.', 'u7-ai-vocab'],
  'u7 realm': ['New ideas in the realm of testing.', 'u7-ai-vocab'],
  'u7 realm after a modifier': ['Within the digital realm of payments, speed matters.', 'u7-ai-vocab'],
  'u7 beacon': ['The project is a beacon of hope.', 'u7-ai-vocab'],
  'u7 multifaceted': ['A multifaceted problem.', 'u7-ai-vocab'],
  'u7 meticulous': ['Meticulous notes help.', 'u7-ai-vocab'],
  'u7 meticulously': ['It was meticulously tested.', 'u7-ai-vocab'],
  'u7 paramount': ['Security is paramount.', 'u7-ai-vocab'],
  'u7 transformative': ['A transformative release.', 'u7-ai-vocab'],
  'u7 supercharge': ['Supercharge your builds.', 'u7-ai-vocab'],
  'u7 ever-evolving': ['An ever-evolving field.', 'u7-ai-vocab'],
  'u7 embark on': ['We embark on a rewrite.', 'u7-ai-vocab'],
  'u9 "isn\'t X, it\'s Y"': ["The question isn't the model, it's the eval.", 'u9-not-just'],
  'u9 "isn\'t X; it\'s Y"': ["Success isn't about working harder; it's about focus.", 'u9-not-just'],
  'u9 "It\'s not X. It\'s Y."': ["It's not a bug. It's a feature.", 'u9-not-just'],
  'u9 "isn\'t X. It\'s Y."': ["This isn't a chatbot. It's a teammate.", 'u9-not-just'],
  'u9 contrast in the main clause after an "if" clause': ["If a beat needs five paragraphs, it's not a beat; it's two beats.", 'u9-not-just'],
  'u23 at the end of the day': ['At the end of the day, tests matter.', 'u23-filler'],
  'u23 when it comes to': ['When it comes to speed, Go wins.', 'u23-filler'],
  'u23 at its core': ['At its core, it is a queue.', 'u23-filler'],
  "u23 in today's world": ["In today's world, speed matters.", 'u23-filler'],
  'u23 in the age of': ['In the age of AI, docs still matter.', 'u23-filler'],
  'u23 the reality is': ['The reality is that nobody reads docs.', 'u23-filler'],
  'u23 the truth is': ['The truth is, most tests are slow.', 'u23-filler'],
  'u23 going forward': ['Going forward, we will tag releases.', 'u23-filler'],
  'u23 in terms of': ['It is fast in terms of latency.', 'u23-filler'],
  'u23 "In terms of" opening a sentence': ['In terms of speed, Go wins.', 'u23-filler'],
  'u23 "But the reality is"': ['But the reality is that nobody reads docs.', 'u23-filler'],
  'u23 with regard to': ['We spoke with regard to pricing.', 'u23-filler'],
  'u34 let me be clear': ['Let me be clear: this is a breaking change.', 'u34-throat-clearing'],
  "u34 I'll be honest": ["I'll be honest, the first version was slow.", 'u34-throat-clearing'],
  'u34 the uncomfortable truth is': ['The uncomfortable truth is that most tests are useless.', 'u34-throat-clearing'],
  "u34 let's dive in": ["Let's dive in.", 'u34-throat-clearing'],
  'u34 in this article': ['In this article, we explore caching.', 'u34-throat-clearing'],
  'u35 what most people get wrong': ['What most people get wrong is the retry budget.', 'u35-fake-insight'],
  'u35 the part everyone misses': ['The part everyone misses is the cache.', 'u35-fake-insight'],
  'u35 this is the part most people skip': ['This is the part most people skip.', 'u35-fake-insight'],
  'u36 the key point is': ['The key point is that retries are capped.', 'u36-metadiscourse'],
  'u36 this distinction matters': ['This distinction matters.', 'u36-metadiscourse'],
  'u36 matters more than it sounds': ['That last part matters more than it sounds.', 'u36-metadiscourse'],
  'u37 think about it:': ['Think about it: every retry doubles the load.', 'u37-rhetorical-setup'],
  'u37 plot twist:': ['Plot twist: the cache was never on.', 'u37-rhetorical-setup'],
  'u37 self-answered "The result?"': ['The result? Builds finished in half the time.', 'u37-rhetorical-setup'],
  'u38 marks a pivotal moment': ['The launch marks a pivotal moment for the company.', 'u38-puffery'],
  'u38 marks a turning point': ['The release marks a turning point.', 'u38-puffery'],
  'u38 solidifies its position': ['The deal solidifies its position as the leader.', 'u38-puffery'],
  'u38 underscores its significance': ['The award underscores its significance.', 'u38-puffery'],
  'u23 that being said': ['That being said, the migration is safe to run twice.', 'u23-filler'],
  'u46 whether you\'re a X or a Y': ["Whether you're a beginner or a pro, start here.", 'u46-marketing-setup'],
  'u46 whether you\'re an X or Y (curly apostrophe)': ['Whether you’re an engineer or designer, this fits.', 'u46-marketing-setup'],
  'u46 that\'s where X comes in': ["That's where Acme comes in.", 'u46-marketing-setup'],
  'u46 say goodbye to': ['Say goodbye to guesswork.', 'u46-marketing-setup'],
  'u46 imagine a world where': ['Imagine a world where deploys never fail.', 'u46-marketing-setup'],
  'u46 more than just': ['This is more than just another build tool.', 'u46-marketing-setup'],
  'u46 helps you to': ['The tool helps you to ship faster.', 'u46-marketing-setup'],
  'u38 stands as a testament': ['The tool stands as a testament to good design.', 'u38-puffery'],
  'u38 paves the way': ['This paves the way for plugins.', 'u38-puffery'],
  'u39 after a sentence': ['It is a teammate. Not a tool. Not a toy.', 'u39-negative-listing'],
  'u39 one per paragraph': ['Not a chatbot.\n\nNot a copilot.\n\nA teammate.', 'u39-negative-listing'],
  'u40 "In summary,"': ['The parser reads the file.\n\nThe writer saves it.\n\nThe CLI prints a report.\n\nIn summary, the tool reads, writes, and reports.\n', 'u40-recap-ending'],
  'u40 "Overall," before a trailing code block': ['The parser reads the file.\n\nThe writer saves it.\n\nThe CLI prints a report.\n\nOverall, the tool is simple.\n\n```\nnpm test\n```\n', 'u40-recap-ending'],
};

async function selftest() {
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const self = fileURLToPath(import.meta.url);
  const problems = [];
  let checks = 0;
  const check = (ok, msg) => { checks++; if (!ok) problems.push(msg); };

  for (const id of RULE_IDS) check(id in SAMPLES, `rule ${id} has no planted sample`);
  for (const [id, text] of Object.entries(SAMPLES)) {
    const got = lintText(text).map((f) => f.rule);
    check(got.includes(id), `planted ${id} not caught: ${JSON.stringify(text)}`);
  }
  for (const [name, text] of Object.entries(IGNORED)) {
    const got = lintText(text);
    check(got.length === 0, `ignored context "${name}" produced ${got.map((f) => `${f.rule} "${f.match}"`).join(', ')}`);
  }
  for (const [name, [text, id]] of Object.entries(MUST_NOT_FIRE)) {
    check(!lintText(text).some((f) => f.rule === id), `${id} fired on ${name}: ${JSON.stringify(text)}`);
  }
  for (const [name, [text, id]] of Object.entries(MUST_FIRE)) {
    check(lintText(text).some((f) => f.rule === id), `${id} missed ${name}: ${JSON.stringify(text)}`);
  }
  const pos = lintText('---\na: delve\n---\n```\ndelve\n```\nWe delve.\n');
  check(pos.length === 1 && pos[0].line === 7 && pos[0].column === 4, `position wrong: ${JSON.stringify(pos)}`);
  check(lintText('Also utilize it.')[0]?.suggestion === 'use' && lintText('Utilize it.')[0]?.suggestion === 'Use', 'suggestion or its case is wrong');
  const cfg = (o) => parseConfig(JSON.stringify(o), 'test');
  for (const id of RULE_IDS) {
    check(!lintText(SAMPLES[id] ?? '', cfg({ disable: [id] })).some((f) => f.rule === id), `disabled rule ${id} still fired`);
  }
  check(lintText('We delve.', cfg({ words: { allow: ['delve'] } })).length === 0, 'words.allow did not exempt a word');
  check(lintText('Real synergy.', cfg({ words: { deny: ['synergy'] } })).some((f) => f.rule === 'u7-ai-vocab'), 'words.deny did not add a word');
  check(lintText('## Using Claude Code', cfg({ words: { allow: ['claude', 'code'] } })).length === 0, 'words.allow did not exempt a proper noun from title case');
  for (const bad of ['{', '[]', '{"disable":["u99-nope"]}', '{"words":{"allow":"x"}}', '{"extra":1}']) {
    let threw = false;
    try { parseConfig(bad, 'test'); } catch (e) { threw = e instanceof RunError; }
    check(threw, `bad config accepted: ${bad}`);
  }

  const dir = mkdtempSync(join(tmpdir(), 'lint-prose-selftest-'));
  const run = (args, opts = {}) => {
    try { return { code: 0, out: execFileSync(process.execPath, [self, ...args], { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], ...opts }) }; }
    catch (e) { return { code: e.status, out: e.stdout ?? '' }; }
  };
  try {
    mkdirSync(join(dir, 'empty'));
    mkdirSync(join(dir, 'docs', 'node_modules'), { recursive: true });
    mkdirSync(join(dir, 'quiet'));
    writeFileSync(join(dir, 'docs', 'clean.md'), 'The parser reads the file and writes a report.\n');
    writeFileSync(join(dir, 'docs', 'node_modules', 'dep.md'), 'We delve.\n');
    writeFileSync(join(dir, 'bad.md'), 'We delve.\n');
    writeFileSync(join(dir, 'quiet', '.prose-lint.json'), '{"disable":["u7-ai-vocab"]}');
    writeFileSync(join(dir, 'quiet', 'a.md'), 'We delve.\n');
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    check(run(['docs']).code === 0, 'a clean directory (with a skipped node_modules) did not exit 0');
    const r = run(['bad.md']);
    let parsed = null;
    try { parsed = JSON.parse(r.out); } catch { parsed = null; }
    check(r.code === 1 && parsed?.findings?.[0]?.rule === 'u7-ai-vocab' && parsed.findings[0].file === 'bad.md', `findings run: exit ${r.code}, stdout ${r.out.trim()}`);
    check(run(['-'], { input: 'We delve.\n' }).code === 1, 'stdin input with findings did not exit 1');
    check(run(['quiet/a.md']).code === 0, 'a .prose-lint.json found by walking up was not applied');
    check(run(['*.md']).code === 1, 'a glob did not expand');
    check(run(['empty']).code === 2, 'an empty input set did not exit 2');
    check(run([]).code === 2, 'no arguments did not exit 2');
    check(run(['missing.md']).code === 2, 'a missing file did not exit 2');
    check(run(['bad.md', '--config', 'broken.json']).code === 2, 'a bad --config did not exit 2');
    check(run(['bad.md', '--bogus']).code === 2, 'an unknown option did not exit 2');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`lint-prose --selftest: ${checks} check(s), ${problems.length} problem(s)`);
  process.stdout.write(JSON.stringify({ status: problems.length ? 'broken' : 'ok', checks, problems }) + '\n');
  return problems.length ? 1 : 0;
}

// ---------- entry ----------

// Real paths on both sides: run through a symlink or junction (how Codex and opencode install skills), argv[1]
// keeps the link path while import.meta.url is the real one.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = process.argv.includes('--selftest') ? await selftest() : main(process.argv.slice(2));
  } catch (e) {
    // Any failure to run, expected or not, exits 2 so it can't be read as findings (1) or clean (0).
    console.error(`lint-prose: ${e instanceof RunError ? e.message : e.stack}`);
    process.stdout.write(JSON.stringify({ status: 'error', reason: e.message }) + '\n');
    process.exitCode = 2;
  }
}
