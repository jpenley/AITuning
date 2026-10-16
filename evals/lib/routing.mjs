// Identify the first real skill load in a harness transcript. A mention in prose or a search is not a load.
const parse = (input) => { try { return JSON.parse(input); } catch { return input; } };

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function readArguments(command) {
  const statements = [];
  let start = 0;
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote && ((char === '`' && quote === '"') || (char === '\\' && command[i + 1] === quote))) { i++; continue; }
    if (char === quote && command[i + 1] === quote) { i++; continue; }
    if (char === "'" || char === '"') {
      if (quote === char) quote = null;
      else if (!quote) quote = char;
    }
    if (!quote && char === '#' && (i === 0 || /\s/.test(command[i - 1]))) {
      statements.push(command.slice(start, i));
      while (i < command.length && command[i] !== '\n') i++;
      start = i + 1;
      continue;
    }
    if (!quote && /[;&|\n]/.test(char)) { statements.push(command.slice(start, i)); start = i + 1; }
  }
  statements.push(command.slice(start));
  return statements.flatMap((statement) => {
    const read = statement.match(/^\s*(cat|type|more|Get-Content|gc)\s+([\s\S]*)$/i);
    if (read) {
      const powershell = /^(?:Get-Content|gc)$/i.test(read[1]);
      const token = powershell ? /"([^"\n]*)"|'([^'\n]*)'|([^\s,]+|,)/g : /"([^"\n]*)"|'([^'\n]*)'|(\S+)/g;
      const words = [...read[2].matchAll(token)].map((match) => match[1] ?? match[2] ?? match[3]);
      if (!powershell) return words.filter((word) => !word.startsWith('-'));
      const paths = [];
      for (let i = 0; i < words.length; i++) {
        if (/^-(?:Raw|Wait|Force)$/i.test(words[i])) continue;
        const parameter = words[i].startsWith('-') ? words[i++] : null;
        const values = words[i] ? [words[i]] : [];
        // A PowerShell path parameter is an array; consume every comma-separated operand together.
        while (words[i + 1] === ',' && words[i + 2]) { values.push(words[i + 2]); i += 2; }
        if (/^-(?:LiteralPath|Path)$/i.test(parameter ?? '') || (!parameter && !paths.length)) paths.push(...values);
      }
      return paths;
    }
    const invocation = statement.match(/^\s*(?:["']([^"']+)["']|([^\s"']+))\s+([\s\S]*)$/);
    if (!invocation || !/(?:^|[\\/])(?:pwsh|powershell|bash|sh)(?:\.exe)?$/i.test(invocation[1] ?? invocation[2])) return [];
    const body = invocation[3].match(/^(?:(?:-NoProfile|-NonInteractive)\s+)*-(?:Command|c|lc)\s+(['"])([\s\S]*)\1\s*$/i);
    return body ? readArguments(body[2]) : [];
  });
}

export function firstSkill(calls, harness, names) {
  const known = new Set(names);
  const skillPath = /(?:^|[\\/])skills[\\/]+([\w-]+)[\\/]+SKILL\.md$/i;
  for (let index = 0; index < calls.length; index++) {
    const call = calls[index];
    const input = parse(call.input);
    let candidates = [];
    if (/^skill$/i.test(call.name)) {
      const fields = typeof input === 'object' && input !== null ? [input.skill, input.name, input.skill_name] : [input];
      // Native skill tools identify a choice even when a global skill leaked outside the catalog.
      candidates = fields.flatMap(strings).map((value) => value.split(':').at(-1)).filter(Boolean);
    } else if (harness !== 'claude' && /read|open|shell|exec|command/i.test(call.name)) {
      const raw = strings(input).join(' ');
      // A shell search can contain a skill path without loading the file.
      // shortcut: recognize direct read commands, revisit when a harness uses another file-read form.
      const reads = /read|open/i.test(call.name) ? strings(typeof input === 'object' && input !== null ? input.file_path ?? input.filePath ?? input.path ?? input.paths : input) : readArguments(raw);
      candidates = reads.map((read) => read.match(skillPath)?.[1]).filter((name) => known.has(name));
    }
    candidates = [...new Set(candidates)];
    if (candidates.length) return { skill: candidates.length === 1 ? candidates[0] : null, status: candidates.length === 1 ? 'observed' : 'ambiguous', candidates, index, callInput: call.input, evidence: { name: call.name, input: call.input.slice(0, 1000) } };
  }
  return { skill: null, status: 'none', candidates: [], index: null, evidence: null };
}

export function routeVerdict(observation, expected, { timedOut = false, exitCode = 0, truncated = false, sessionFailed = false } = {}) {
  if (timedOut || exitCode !== 0 || sessionFailed) return 'invalid';
  if (truncated) return 'uncertain';
  if (observation.status === 'ambiguous') return 'ambiguous';
  if (observation.status === 'none') return 'none';
  return observation.skill === expected ? 'correct' : 'wrong';
}

// A set of recognized requests to load skills, not proof their content was used successfully.
// Generic transcript parsing can collapse repeated calls; never present this as an attempt count.
export function recognizedLoadSet(calls, transcript, harness, names, { invalid = false, truncated = false } = {}) {
  const attempted = new Set();
  const evidence = [];
  const warnings = [];
  for (const call of calls) {
    // Direct file reads are useful evidence in Claude too, independent of first-route semantics.
    const observation = firstSkill([call], harness === 'claude' ? 'codex' : harness, names);
    if (!observation.candidates.length) continue;
    observation.candidates.forEach(name => attempted.add(name));
    evidence.push({ candidates: observation.candidates, ...observation.evidence });
    const failure = loadFailure(transcript, harness, observation);
    if (failure) warnings.push(`${observation.candidates.join(', ')}: ${failure.replace(/^first /, '')}`);
  }
  return { attempted: [...attempted].sort(), status: invalid ? 'invalid' : truncated ? 'uncertain' : warnings.length ? 'failed-load' : 'observed', semantics: 'recognized load requests; successful content loading is not inferred', evidence, warnings: [...new Set(warnings)] };
}

export function sessionFailure(transcript, harness) {
  for (const line of transcript.split(/\r?\n/)) {
    const ev = parse(line);
    if (!ev || typeof ev !== 'object') continue;
    if (harness === 'claude' && ev.type === 'result' && (ev.is_error || ev.subtype?.startsWith('error'))) return ev.subtype ?? 'error result';
    if (harness === 'codex' && ev.type === 'turn.failed') return ev.type;
    if (harness === 'opencode' && ev.type === 'error') return ev.type;
  }
  return null;
}

export function toolOutputTruncated(transcript, harness) {
  if (harness !== 'opencode') return false;
  return transcript.split(/\r?\n/).some((line) => {
    const event = parse(line);
    return event?.type === 'tool_use' && event.part?.state?.metadata?.truncated === true;
  });
}

export function loadFailure(transcript, harness, observation) {
  if (!observation.evidence) return null;
  const events = transcript.split(/\r?\n/).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  if (harness === 'claude') {
    const ids = new Set(events.flatMap((ev) => ev.type === 'assistant' ? ev.message?.content ?? [] : [])
      .filter((block) => block.type === 'tool_use' && block.name === observation.evidence.name && JSON.stringify(block.input ?? {}) === observation.callInput).map(block => block.id));
    if (!ids.size) return null;
    const failure = events.some((ev) => ev.type === 'user' && ev.message?.content?.some((block) => block.type === 'tool_result' && ids.has(block.tool_use_id) && (block.is_error || ev.tool_use_result?.success === false)));
    return failure ? 'first skill-load tool returned an error' : null;
  }
  if (harness === 'codex') {
    const failure = events.some((ev) => ev.type === 'item.completed' && ev.item?.type === 'command_execution' && ev.item.command === observation.callInput && ev.item.exit_code != null && ev.item.exit_code !== 0);
    return failure ? 'first skill-read command failed' : null;
  }
  const failure = events.some((ev) => {
    const state = ev.part?.state;
    if (!state || !['error', 'failed'].includes(state.status)) return false;
    const direct = ev.part.tool === observation.evidence.name && JSON.stringify(state.input ?? {}) === observation.callInput;
    // Generic parsing also exposes a bash/tool command as a normalized shell call.
    const command = state.input?.command ?? state.input?.cmd;
    const shell = observation.evidence.name === 'shell' && (typeof command === 'string' || Array.isArray(command)) && [].concat(command).join(' ') === observation.callInput;
    return direct || shell;
  });
  return failure ? 'first skill-load tool returned an error' : null;
}
