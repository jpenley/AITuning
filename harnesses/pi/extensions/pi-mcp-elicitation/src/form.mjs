const own = (o, k) => Object.hasOwn(o, k);
export function fail() { throw new Error('MCP elicitation: unsupported or invalid data.'); }
export function object(x) { return x !== null && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x)); }
export function bounded(x, maxBytes = 65536) {
  let text;
  try { text = JSON.stringify(x); } catch { fail(); }
  if (typeof text !== 'string' || Buffer.byteLength(text) > maxBytes) fail();
  function walk(v) {
    if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v))) fail();
    if (v && typeof v === 'object' && !Array.isArray(v) && !object(v)) fail();
    if (typeof v === 'string' && [...v].length > 8192) fail();
    if (Array.isArray(v)) { for (const value of v) walk(value); }
    else if (v && typeof v === 'object') for (const [key, value] of Object.entries(v)) { if ([...key].length > 8192) fail(); walk(value); }
  }
  walk(x);
}
export function display(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/gu, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
function keys(o, allowed) { if (!object(o) || Object.keys(o).some(k => !allowed.includes(k))) fail(); }
const annotations = ['title', 'description', 'default'];
function annotate(s) { for (const k of ['title', 'description']) if (own(s, k) && typeof s[k] !== 'string') fail(); }
function choices(s, alternative) {
  if (own(s, 'enum') && own(s, alternative)) fail();
  let values, labels;
  if (own(s, 'enum')) {
    values = s.enum;
    labels = s.enumNames;
    if (labels !== undefined && (!Array.isArray(labels) || labels.length !== values?.length || labels.some(v => typeof v !== 'string'))) fail();
  } else if (own(s, alternative)) {
    if (own(s, 'enumNames') || !Array.isArray(s[alternative])) fail();
    values = []; labels = [];
    for (const item of s[alternative]) {
      keys(item, ['const', 'title']);
      if (typeof item.const !== 'string' || typeof item.title !== 'string') fail();
      values.push(item.const); labels.push(item.title);
    }
  } else { if (own(s, 'enumNames')) fail(); return undefined; }
  if (!Array.isArray(values) || values.length < 1 || values.length > 128 || values.some(v => typeof v !== 'string') || new Set(values).size !== values.length) fail();
  return values.map((value, i) => ({ value, label: labels?.[i] ?? value }));
}
function count(s, k, max) { if (own(s, k) && (!Number.isSafeInteger(s[k]) || s[k] < 0 || s[k] > max)) fail(); }
function formatValid(value, format) {
	if (format === undefined) return true;
	if (format === "email") {
		const parts = value.split("@");
		return (
			parts.length === 2 &&
			parts[0].length > 0 &&
			!/\s/u.test(value) &&
			parts[1].includes(".") &&
			!parts[1].startsWith(".") &&
			!parts[1].endsWith(".")
		);
	}
	if (format === "uri") {
		return (
			URL.canParse(value) &&
			!/[^\x21-\x7e]/.test(value) &&
			!/[<>"{}|\\^`]/.test(value) &&
			!/%(?![a-f0-9]{2})/i.test(value)
		);
	}
	const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(format === "date" ? value : value.slice(0, 10));
	if (!date) return false;
	const parsed = new Date(`${date[0]}T00:00:00Z`);
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date[0]) return false;
	return (
		format === "date" ||
		(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.test(
			value,
		) &&
			Number.isFinite(Date.parse(value)))
	);
}

export function valid(field, value) {
  const s = field.schema;
  if (s.type === 'boolean') return typeof value === 'boolean';
  if (s.type === 'string') return typeof value === 'string' && [...value].length <= 8192 && [...value].length >= (s.minLength ?? 0) && [...value].length <= (s.maxLength ?? 8192) && (!field.choices || field.choices.some(c => c.value === value)) && (!s.format || formatValid(value, s.format));
  if (s.type === 'number' || s.type === 'integer') return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER && (s.type !== 'integer' || Number.isSafeInteger(value)) && value >= (s.minimum ?? -Number.MAX_SAFE_INTEGER) && value <= (s.maximum ?? Number.MAX_SAFE_INTEGER);
  return Array.isArray(value) && value.length >= (s.minItems ?? 0) && value.length <= (s.maxItems ?? 128) && new Set(value).size === value.length && value.every(v => field.choices.some(c => c.value === v));
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function parseRequest(input) {
  keys(input, ['server', 'source', 'request']);
  if (typeof input.server !== 'string' || !input.server || typeof input.source !== 'string' || !input.source) fail();
  // Protocol payload and trusted bridge labels have independent byte budgets.
  bounded(input.request);
  bounded({ server: input.server, source: input.source });
  input = JSON.parse(JSON.stringify(input));
  const r = input.request;
  keys(r, ['mode', 'message', 'requestedSchema']);
  if ((r.mode !== undefined && r.mode !== 'form') || typeof r.message !== 'string') fail();
  const root = r.requestedSchema;
  keys(root, ['type', 'properties', 'required', 'additionalProperties', 'title', 'description', 'default', '$schema']);
  annotate(root);
  if (root.$schema !== undefined && !['https://json-schema.org/draft/2020-12/schema', 'http://json-schema.org/draft-07/schema#'].includes(root.$schema)) fail();
  if (root.type !== 'object' || !object(root.properties) || Object.keys(root.properties).length > 32 || (root.additionalProperties !== undefined && root.additionalProperties !== false)) fail();
  const required = root.required === undefined ? [] : root.required;
  if (!Array.isArray(required) || new Set(required).size !== required.length || required.some(k => typeof k !== 'string' || !own(root.properties, k))) fail();
  const fields = Object.entries(root.properties).map(([name, s]) => {
    if (!object(s)) fail();
    const base = ['type', ...annotations];
    let options;
    if (s.type === 'boolean') keys(s, base);
    else if (s.type === 'string') {
      keys(s, [...base, 'minLength', 'maxLength', 'format', 'enum', 'enumNames', 'oneOf']);
      count(s, 'minLength', 8192); count(s, 'maxLength', 8192);
      if ((s.minLength ?? 0) > (s.maxLength ?? 8192) || (s.format !== undefined && !['email', 'uri', 'date', 'date-time'].includes(s.format))) fail();
      options = choices(s, 'oneOf');
    } else if (s.type === 'number' || s.type === 'integer') {
      keys(s, [...base, 'minimum', 'maximum']);
      for (const k of ['minimum', 'maximum']) if (own(s, k) && (typeof s[k] !== 'number' || !Number.isFinite(s[k]) || Math.abs(s[k]) > Number.MAX_SAFE_INTEGER || (s.type === 'integer' && !Number.isSafeInteger(s[k])))) fail();
      if ((s.minimum ?? -Number.MAX_SAFE_INTEGER) > (s.maximum ?? Number.MAX_SAFE_INTEGER)) fail();
    } else if (s.type === 'array') {
      keys(s, [...base, 'items', 'minItems', 'maxItems']);
      keys(s.items, ['type', 'enum', 'enumNames', 'anyOf']);
      if (s.items.type !== 'string' && !(s.items.type === undefined && own(s.items, 'anyOf'))) fail();
      options = choices(s.items, 'anyOf');
      if (!options) fail();
      count(s, 'minItems', 128); count(s, 'maxItems', 128);
      if ((s.minItems ?? 0) > (s.maxItems ?? 128) || (s.minItems ?? 0) > options.length) fail();
    } else fail();
    annotate(s);
    const field = { name, schema: s, required: required.includes(name), choices: options };
    if (options && s.type === 'string' && options.some(c => !valid(field, c.value))) fail();
    if (own(s, 'default') && !valid(field, s.default)) fail();
    return field;
  });
  const form = { server: input.server, source: input.source, message: r.message, fields };
  if (own(root, 'default')) validateContent(form, root.default);
  return freeze(form);
}
export function validateContent(form, content) {
  bounded(content);
  if (!object(content) || Object.keys(content).some(k => !form.fields.some(f => f.name === k))) fail();
  for (const field of form.fields) if (own(content, field.name) ? !valid(field, content[field.name]) : field.required) fail();
  return content;
}
