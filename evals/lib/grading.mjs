// What graders read, and the pattern graders. Material can be cut (a child's output over the cap keeps only its
// head and tail), and text that was cut must never make a grader pass: a pattern is tested on each kept piece
// apart, so no match spans the gap, and "must not match" can't pass on material with a gap in it.
import { regexSearch } from './regex.mjs';

export const pf = (ok, why) => ({ status: ok ? 'pass' : 'fail', why });

// ctx: { reply, diff: { text }, transcript, transcriptParts?: [head, tail], replyCut?: boolean }.
// Returns { segments, cut }: the material for `on` ("reply", "diff+transcript", ...) as pieces that are each
// contiguous in the original, and whether any of it may be incomplete.
export function materialSegments(on, ctx) {
  const segments = [''];
  let cut = false;
  on.split('+').forEach((k, i) => {
    if (i) segments[segments.length - 1] += '\n\n';
    let parts = [({ reply: ctx.reply, diff: ctx.diff?.text, transcript: ctx.transcript })[k] ?? ''];
    if (k === 'transcript' && ctx.transcriptParts) { parts = ctx.transcriptParts; cut = true; }
    if (k === 'reply' && ctx.replyCut) cut = true;
    segments[segments.length - 1] += parts[0];
    segments.push(...parts.slice(1));
  });
  return { segments, cut };
}

// The material as one text (for the judge, which is told where output was cut by the marker in it).
export const material = (on, ctx) => on.split('+').map((k) => ({ reply: ctx.reply, diff: ctx.diff?.text, transcript: ctx.transcript })[k] ?? '').join('\n\n');

export async function gradeRegex(g, ctx, opts) {
  const { segments, cut } = materialSegments(g.on ?? 'reply', ctx);
  const r = await regexSearch(g.pattern, g.flags ?? '', segments, opts);
  if (r.error) return { status: 'error', why: r.error };
  const negate = g.negate === 'true';
  if (negate && !r.hit && cut) return { status: 'error', why: 'no match, but the output was cut, so the text may have been in the part that was dropped' };
  return pf(r.hit !== negate, r.hit ? 'matched' : 'no match');
}

// A tool_used grader's verdict on n counted calls. Calls in output that was cut weren't counted, so a count
// within an upper bound (max: 0 = "never called") proves nothing then.
export function gradeCalls(n, g, ctx) {
  const min = g.min != null ? Number(g.min) : 1;
  const max = g.max != null ? Number(g.max) : Infinity;
  const ok = n >= min && n <= max;
  if (ok && ctx.transcriptParts && max !== Infinity) return { status: 'error', why: `${n} call(s), but the transcript was cut, so calls may be missing` };
  return pf(ok, `${n} call(s)`);
}

// A tool_order grader: each non-blank line of its body is a step, a regex tested on one call as "<name> <input>".
// The last step is the gated action (the fix's edit, say): its first call must come after calls matching every
// earlier step, in that order; other calls may fall anywhere. Calls in output that was cut weren't recorded, so a
// cut transcript decides nothing either way (a missing call could be an earlier gated action or a missing step).
export function gradeOrder(g, calls, ctx) {
  let steps;
  try {
    steps = (g.body ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s) => new RegExp(s));
  } catch (e) {
    return { status: 'error', why: `invalid step: ${e.message}` };
  }
  if (steps.length < 2) return { status: 'error', why: 'tool_order needs two or more steps, one regex per line of the body' };
  if (ctx.transcriptParts) return { status: 'error', why: 'the transcript was cut, so calls may be missing' };
  const lines = calls.map((c) => `${c.name} ${c.input}`);
  const gate = lines.findIndex((l) => steps.at(-1).test(l));
  if (gate < 0) return pf(false, 'the last step never happened');
  let done = 0;
  for (const l of lines.slice(0, gate)) if (done < steps.length - 1 && steps[done].test(l)) done++;
  return pf(done === steps.length - 1, done === steps.length - 1 ? `in order, gated call #${gate + 1}` : `gated call #${gate + 1} came before step ${done + 1}`);
}

// A grader's `hint`: a case-insensitive pattern that, when it matches, passes the grader without the judge.
// Resolves { hit } or { error }.
export const hintSearch = (g, ctx, opts) => regexSearch(g.hint, 'i', materialSegments(g.on ?? 'reply', ctx).segments, opts);

// An llm grader: a matching hint passes it without calling askJudge. A hint only saves a judge call, so one that
// errors (timed out, invalid) counts as no match: the judge decides, and the error is noted in `why` and returned
// as `warning` for the caller to report.
export async function withHint(g, ctx, askJudge, opts) {
  const h = g.hint ? await hintSearch(g, ctx, opts) : { hit: false };
  if (h.hit) return pf(true, 'hint matched');
  const r = await askJudge();
  if (!h.error) return r;
  const note = `hint skipped: ${h.error}`;
  return { ...r, why: `${note}; judge: ${r.why}`, warning: `${g.id}: ${note}` };
}
