// Text an agent produced (grader reasons, stderr tails, warnings) is printed to a terminal. Control characters,
// ANSI escapes, and bidi or line-separator characters there can rewrite the screen, forge report lines, or
// reorder what a reader sees, so they are shown as visible \x.. / \u.... escapes instead. Saved files keep the
// raw text.

// Code point ranges (inclusive): C0 controls except tab and newline, DEL and the C1 controls, the Arabic letter
// mark, LRM and RLM, the line and paragraph separators, the bidi embeddings and overrides (202A-202E), the bidi
// isolates (2066-2069), and the byte order mark. Written as numbers so this file holds no such character itself.
const RANGES = [[0x00, 0x08], [0x0b, 0x1f], [0x7f, 0x9f], [0x61c, 0x61c], [0x200e, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]];
const NEWLINE = [[0x0a, 0x0a]];
const hex = (n, w) => n.toString(16).padStart(w, '0');
const cls = (ranges) => new RegExp(`[${ranges.map(([a, b]) => `\\u{${hex(a, 4)}}-\\u{${hex(b, 4)}}`).join('')}]`, 'gu');
const UNSAFE = cls(RANGES);
const UNSAFE_OR_NEWLINE = cls([...RANGES, ...NEWLINE]);

const BACKSLASH = String.fromCharCode(92);
const visible = (c) => {
  const n = c.charCodeAt(0);
  return n < 0x100 ? `${BACKSLASH}x${hex(n, 2)}` : `${BACKSLASH}u${hex(n, 4)}`;
};

// Safe to print; newlines kept (for the script's own multi-line output).
export const termSafe = (s) => String(s).replace(UNSAFE, visible);

// Safe to print inside one report line: newlines escaped too, so agent text can't start a line of its own.
export const oneLine = (s) => String(s).replace(UNSAFE_OR_NEWLINE, visible);

// JSON with the same characters written as \u.... escapes inside its strings (JSON.stringify already escapes
// C0 controls, and these characters can occur only inside strings). Parsing it gives back exactly the same
// values, so this changes how stdout looks in a terminal, not what it says.
export const jsonSafe = (value) => JSON.stringify(value).replace(UNSAFE, (c) => `${BACKSLASH}u${hex(c.charCodeAt(0), 4)}`);

// A logger that writes one sanitized line.
export const makeLog = (write) => (s = '') => write(termSafe(s) + '\n');
