import { readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { display, fail, object, valid } from './form.mjs';

export function check(signal) { if (signal.aborted) throw new DOMException('Elicitation cancelled', 'AbortError'); }
export async function dialog(ctx, signal, method, ...args) {
  check(signal);
  const value = await ctx.ui[method](...args, { signal });
  check(signal);
  return value;
}
function fieldTitle(form, field) {
  return `MCP server: ${display(form.server)} | Source: ${display(form.source)}\nRequest (untrusted): ${display(form.message)}\nField: ${display(field.name)}\n${display(field.schema.title ?? '')} ${display(field.schema.description ?? '')}`;
}
export async function nativeCollect({ form, ctx, signal }) {
  const content = Object.create(null);
  for (const field of form.fields) {
    const title = fieldTitle(form, field);
    if (!field.required) {
      const include = await dialog(ctx, signal, 'select', title, ['Provide value', 'Omit field']);
      if (include === undefined) return { cancelled: true };
      if (include === 'Omit field') continue;
      if (include !== 'Provide value') fail();
    }
    let value;
    if (field.schema.type === 'array') {
      const selected = [];
      for (const choice of field.choices) {
        const answer = await dialog(ctx, signal, 'select', `${title}\nValue: ${display(choice.value)} (${display(choice.label)})`, ['Include', 'Exclude']);
        if (answer === undefined) return { cancelled: true };
        if (answer === 'Include') selected.push(choice.value);
        else if (answer !== 'Exclude') fail();
      }
      value = selected;
    } else if (field.schema.type === 'boolean' || field.choices) {
      const choices = field.schema.type === 'boolean' ? [{ value: true, label: 'true' }, { value: false, label: 'false' }] : field.choices;
      const labels = choices.map((c, i) => `C${i + 1}: ${display(c.value)}`);
      const answer = await dialog(ctx, signal, 'select', title, labels);
      if (answer === undefined) return { cancelled: true };
      const i = labels.indexOf(answer);
      if (i < 0) fail();
      value = choices[i].value;
    } else {
      const answer = await dialog(ctx, signal, 'input', title, 'Enter a value (defaults are not submitted)');
      if (answer === undefined) return { cancelled: true };
      if (typeof answer !== 'string') fail();
      if (field.schema.type === 'string') value = answer;
      else {
        if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(answer)) fail();
        value = Number(answer);
      }
    }
    if (!valid(field, value)) fail();
    content[field.name] = value;
  }
  return { content };
}

const PACKAGE = '@juicesharp/rpiv-ask-user-question';
function assertions(schema, properties = false) {
  if (Array.isArray(schema)) return schema.map(value => assertions(value));
  if (!object(schema)) return schema;
  return Object.fromEntries(Object.entries(schema).filter(([k]) => properties || !['description', 'default'].includes(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, assertions(v, !properties && k === 'properties')]));
}
const optionSchema = { type: 'object', properties: { label: { type: 'string', maxLength: 60 }, description: { type: 'string' }, preview: { type: 'string' } }, required: ['label', 'description'] };
const expected = { type: 'object', properties: { questions: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', properties: { question: { type: 'string' }, header: { type: 'string', maxLength: 16 }, options: { type: 'array', minItems: 2, maxItems: 4, items: optionSchema }, multiSelect: { type: 'boolean' } }, required: ['question', 'header', 'options'] } } }, required: ['questions'] };
export async function knownRpiv(pi, ctx) {
  if (ctx.mode !== 'tui' || !ctx.tools.some(t => t.name === 'ask_user_question')) return false;
  const tool = pi.getAllTools().find(t => t.name === 'ask_user_question');
  const source = tool?.sourceInfo;
  if (!source || source.origin !== 'package' || typeof source.source !== 'string') return false;
  if (JSON.stringify(assertions(tool.parameters)) !== JSON.stringify(assertions(expected))) return false;
  try {
    const entry = await realpath(source.path);
    const root = dirname(entry);
    const identity = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const npmSource = source.source === `npm:${PACKAGE}` || source.source === `npm:${PACKAGE}@2.13.9`;
    const localSource = !source.source.startsWith('npm:') && await realpath(source.source).catch(() => undefined) === await realpath(root);
    if (!npmSource && !localSource) return false;
    return identity.name === PACKAGE && identity.version === '2.13.9' && entry === await realpath(join(root, 'index.ts'));
  } catch { return false; } // Unverifiable provenance is not a recognized provider.
}
export function rpivPlan(form) {
  if (form.fields.length < 1 || form.fields.length > 4) return undefined;
  const fields = [];
  for (const field of form.fields) {
    let choices = field.schema.type === 'boolean' ? [{ value: true, label: 'true' }, { value: false, label: 'false' }] : field.choices?.map(c => ({ ...c }));
    if (!choices || (field.schema.type === 'array' && !field.required)) return undefined;
    if (!field.required) choices.push({ omit: true, label: 'Omit this field' });
    if (choices.length < 2 || choices.length > 4) return undefined;
    fields.push({ field, choices });
  }
  return { fields, questions: fields.map(({ field, choices }, i) => ({
    question: `${fieldTitle(form, field)}\nF${i + 1}: Choose a value?`, header: `F${i + 1}`,
    multiSelect: field.schema.type === 'array',
    options: choices.map((c, j) => ({ label: `C${j + 1}`, description: c.omit ? 'Omit this field' : `${display(c.value)} (${display(c.label)})` })),
  })) };
}
export function decodeRpiv(plan, outcome) {
  if (outcome?.isError || outcome?.result?.isError) fail();
  const d = outcome?.result?.details;
  if (!object(d) || typeof d.cancelled !== 'boolean' || Object.hasOwn(d, 'error') || !Array.isArray(d.answers)) fail();
  if (d.cancelled) return { cancelled: true };
  if ((d.unanswered !== undefined && (!Array.isArray(d.unanswered) || d.unanswered.length)) || d.answers.length !== plan.fields.length) fail();
  const seen = new Set(), content = Object.create(null);
  for (const answer of d.answers) {
    if (!object(answer) || !Number.isInteger(answer.questionIndex) || answer.questionIndex < 0 || answer.questionIndex >= plan.fields.length || seen.has(answer.questionIndex)) fail();
    seen.add(answer.questionIndex);
    const i = answer.questionIndex, { field, choices } = plan.fields[i];
    if (answer.question !== plan.questions[i].question) fail();
    if (field.schema.type === 'array') {
      if (answer.kind !== 'multi' || answer.answer !== null || !Array.isArray(answer.selected) || new Set(answer.selected).size !== answer.selected.length) fail();
      content[field.name] = answer.selected.map(label => {
        const j = plan.questions[i].options.findIndex(o => o.label === label);
        if (j < 0) fail();
        return choices[j].value;
      });
    } else {
      if (answer.kind !== 'option' || answer.selected !== undefined) fail();
      const j = plan.questions[i].options.findIndex(o => o.label === answer.answer);
      if (j < 0) fail();
      if (!choices[j].omit) content[field.name] = choices[j].value;
    }
  }
  return { content };
}
export async function rpivCollect({ pi, ctx, signal, callId, plan }) {
  let nestedId;
  const cancel = () => { if (nestedId) pi.events.emit('rpiv:ask-user:answer', { toolCallId: nestedId, cancel: true }); };
  const off = pi.events.on('rpiv:ask-user:prompt', payload => {
    if (typeof payload?.toolCallId !== 'string' || !payload.toolCallId.startsWith(`${callId}/`) || !/^\d+$/u.test(payload.toolCallId.slice(callId.length + 1))) return;
    if (nestedId && nestedId !== payload.toolCallId) return;
    nestedId = payload.toolCallId;
    if (signal.aborted) cancel();
  });
  signal.addEventListener('abort', cancel, { once: true });
  try {
    check(signal);
    // RPIV ignores execute's signal. Public answer cancellation closes the precise nested TUI.
    // Await the call even after abort so another queued interaction cannot overlap cleanup.
    const outcome = await ctx.executeTool('ask_user_question', { questions: plan.questions }, { signal });
    check(signal);
    return decodeRpiv(plan, outcome);
  } finally {
    signal.removeEventListener('abort', cancel);
    off();
  }
}
