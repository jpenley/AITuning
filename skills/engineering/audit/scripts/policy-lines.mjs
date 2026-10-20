// Semantic views only: raw secret scanning and document-preservation checks stay separate.
const scripts = /\.(?:[cm]?js|jsx|ts|tsx)$/i;
const records = /\.(?:md|markdown|log)$/i;
const escape = String.fromCharCode(92);
const quoteEnd = (source, start) => {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === escape) { i++; continue; }
    if (source[i] === source[start]) return i + 1;
  }
  return source.length;
};

// Recognize this checker's temporary negative fixtures, not arbitrary string data.
// Uncertain values (including command variables and aliases) remain visible.
function fixtureData(source) {
  const writer = /const\s+put\s*=\s*\(f,\s*s\)\s*=>\s*writeFileSync\(join\(repo,\s*f\),\s*s\)/.test(source)
    && source.includes('const repo = mkdtempSync(') && source.includes("process.argv.includes('--selftest')");
  if (!writer) return { writer: false, collection: null };
  const start = source.indexOf('const rust = {');
  if (start < 0) return { writer, collection: null };
  const open = source.indexOf('{', start);
  let depth = 0;
  let skeleton = '';
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'") { skeleton += 'S'; i = quoteEnd(source, i) - 1; continue; }
    skeleton += c;
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (depth > 0) continue;
    const pure = [...skeleton].every(x => /\s/.test(x) || 'S{},:[]'.includes(x));
    const close = source.indexOf('process.exit(problems.length ? 1 : 0);', i + 1);
    const uses = source.slice(i + 1, close < 0 ? undefined : close).replace(/Object\.entries\(rust\)|rust\[f\]\[n - 1\]/g, '');
    return { writer, collection: pure && !/\brust\b/.test(uses) ? [open, i + 1] : null };
  }
  return { writer, collection: null };
}

function templateEnd(source, start) {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === escape) { i++; continue; }
    if (source[i] === '`') return i + 1;
    if (source[i] !== '$' || source[i + 1] !== '{') continue;
    let depth = 1;
    i += 2;
    for (; i < source.length && depth; i++) {
      const c = source[i];
      if (c === '"' || c === "'") { i = quoteEnd(source, i) - 1; continue; }
      if (c === '`') {
        const end = templateEnd(source, i);
        if (end === null) return null;
        i = end - 1;
      } else if (c === '/') return null; // Ambiguous expression: retain the remainder raw.
      else if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    if (depth) return null;
    i--;
  }
  return null;
}

export function policyLines(file, source) {
  if (records.test(file) && !source.startsWith('#!')) return null;
  if (!scripts.test(file)) return source.split(/\r?\n/).map(text => ({ policy: text, tests: text }));
  const policy = source.split('');
  const tests = source.split('');
  const fixture = fixtureData(source);
  const calls = [];
  const blank = (start, end, comments = false) => {
    for (let k = start; k < end; k++) {
      if (source[k] !== '\n' && source[k] !== '\r') {
        tests[k] = ' ';
        if (!comments) policy[k] = ' ';
      }
    }
  };
  let previous = '';
  let braceDepth = 0;
  const firstLineEnd = source.indexOf(String.fromCharCode(10));
  const start = source.startsWith('#!') ? (firstLineEnd < 0 ? source.length : firstLineEnd + 1) : 0;
  for (let i = start; i < source.length;) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? source.length : end;
      blank(i, stop, true);
      i = stop;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      blank(i, stop, true);
      i = stop;
      continue;
    }
    if (c === '`') {
      const end = templateEnd(source, i);
      if (end === null) break;
      // Template text can execute: preserve it, without interpreting its quotes as JS tokens.
      i = end;
      previous = 'value';
      continue;
    }
    if (c === '"' || c === "'") {
      const end = quoteEnd(source, i);
      const tail = calls.filter(call => call.name);
      const producer = tail.findIndex(call => call.name === 'RegExp' || (fixture.writer && call.name === 'put'));
      const dataCall = producer >= 0 && braceDepth === tail[producer].depth
        && tail.slice(producer + 1).every(call => call.name === 'join' && call.depth === braceDepth);
      const collection = fixture.collection && i > fixture.collection[0] && i < fixture.collection[1];
      if (dataCall || collection) blank(i, end);
      previous = 'value';
      i = end;
      continue;
    }
    const arrowRegex = c === '/' && previous === '>'
      && /=>\s*$/.test(tests.slice(Math.max(0, i - 120), i).join(''));
    if (c === '/' && (!previous || '=(:,[!&|?{;'.includes(previous) || previous === 'return' || arrowRegex)) {
      let end = i + 1;
      let bracket = false;
      for (; end < source.length && source[end] !== '\n'; end++) {
        if (source[end] === escape) { end++; continue; }
        if (source[end] === '[') bracket = true;
        if (source[end] === ']') bracket = false;
        if (source[end] === '/' && !bracket) break;
      }
      if (source[end] === '/') {
        end++;
        while (end < source.length && /[a-z]/i.test(source[end])) end++;
        blank(i, end);
        previous = 'value';
        i = end;
        continue;
      }
    }
    // An unclassified slash may be division or a regex after a block. Retain raw text
    // rather than misreading a regex's // as a comment and hiding subsequent tests.
    if (c === '/') break;
    if (c === '(') {
      const before = tests.slice(Math.max(0, i - 120), i).join('');
      const match = /([\w$.]+)\s*$/.exec(before);
      calls.push({ name: match?.[1].split('.').at(-1) ?? null, depth: braceDepth });
    } else if (c === ')') calls.pop();
    if (/[a-z_$]/i.test(c)) {
      let end = i + 1;
      while (end < source.length && /[\w$]/.test(source[end])) end++;
      previous = source.slice(i, end);
      i = end;
      continue;
    }
    if (c === '{') braceDepth++;
    if (c === '}') braceDepth = Math.max(0, braceDepth - 1);
    if (!/\s/.test(c)) previous = c;
    i++;
  }
  const policies = policy.join('').split(/\r?\n/);
  const testLines = tests.join('').split(/\r?\n/);
  const rawLines = source.split(String.fromCharCode(10));
  return policies.map((text, i) => ({
    policy: text,
    tests: /^\s*\/\//.test(rawLines[i]) ? '' : testLines[i],
  }));
}
