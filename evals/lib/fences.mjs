// Fenced code blocks in Markdown, read the CommonMark way: a fence is three or more backticks or tildes; it
// closes only on a line of the same character, at least as long, with nothing after it but spaces. So a
// ```` fence can hold ``` examples, and a fence with no closing line runs to the end of the file.

const OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
const CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

// Every fenced block: { indent, fence, info, start, end (line indexes, end inclusive), lines, closed }.
// `lines` are the content lines with CR removed.
export function scanFences(src) {
  const lines = src.split('\n').map((l) => l.replace(/\r$/, ''));
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OPEN);
    if (!m || (m[2][0] === '`' && m[3].includes('`'))) continue; // a backtick info string can't hold a backtick
    const [, indent, fence, info] = m;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const c = lines[j].match(CLOSE);
      if (c && c[1][0] === fence[0] && c[1].length >= fence.length) break;
    }
    const closed = j < lines.length;
    blocks.push({ indent, fence, info: info.trim(), start: i, end: closed ? j : lines.length - 1, lines: lines.slice(i + 1, j), closed });
    i = j;
  }
  return blocks;
}

// Markdown with fenced code blocks blanked out (line count kept), so examples inside code don't count as
// links or references.
export function stripFences(md) {
  const lines = md.split('\n');
  for (const b of scanFences(md)) for (let i = b.start; i <= b.end; i++) lines[i] = '';
  return lines.join('\n');
}

// The fenced block whose first line is "## <heading>", de-indented by its fence's indent, LF line endings.
export function agentsBlock(src, heading) {
  for (const b of scanFences(src)) {
    const body = b.lines.map((l) => (l.startsWith(b.indent) ? l.slice(b.indent.length) : l));
    if (body[0]?.trimEnd() !== `## ${heading}`) continue;
    if (!b.closed) throw new Error(`the fenced block starting "## ${heading}" has no closing fence`);
    return body.join('\n') + '\n';
  }
  throw new Error(`no fenced block starting "## ${heading}"`);
}
