import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, validateContent, display } from '../src/form.mjs';
const form = (property, required = true) => parseRequest({ server: 's', source: 'src', request: { message: 'm', requestedSchema: { type: 'object', properties: { x: property }, required: required ? ['x'] : [] } } });

// Break: unknown assertions silently become weaker schemas.
test('strict assertion allowlist and invalid defaults fail closed', () => {
  for (const schema of [
    { type: 'string', pattern: '.*' }, { type: 'string', $ref: '#/x' }, { type: 'string', not: {} },
    { type: 'object' }, { type: 'array', items: { type: 'number' } }, { type: 'number', multipleOf: 2 },
    { type: 'integer', maximum: 1.5 }, { type: 'string', minLength: 4, maxLength: 3 },
    { type: 'boolean', default: 0 }, { type: 'string', enum: ['a', 'a'] },
    { type: 'string', enum: Array.from({ length: 129 }, (_, i) => String(i)) },
  ]) assert.throws(() => form(schema));
});

test('formats, codepoint lengths, safe numbers and string enum arrays validate', () => {
  for (const [schema, good, bad] of [
    [{ type: 'string', format: 'date' }, '2024-02-29', '2023-02-29'],
    [{ type: 'string', format: 'date-time' }, '2024-02-29T23:59:59Z', '2024-02-29T24:00:00Z'],
    [{ type: 'string', format: 'email' }, 'a@b.com', 'a@b'],
    [{ type: 'string', format: 'uri' }, 'urn:example:value', 'not a uri'],
    [{ type: 'string', minLength: 1, maxLength: 1 }, '😀', '😀😀'],
    [{ type: 'number', minimum: 0, maximum: 2 }, 0, -1],
    [{ type: 'integer' }, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1],
    [{ type: 'string', oneOf: [{ const: 'a', title: 'A' }] }, 'a', 'A'],
    [{ type: 'array', items: { type: 'string', anyOf: [{ const: 'a', title: 'A' }, { const: 'b', title: 'B' }] }, minItems: 1, maxItems: 2 }, ['a'], ['a', 'a']],
  ]) {
    const parsed = form(schema);
    assert.deepEqual(validateContent(parsed, { x: good }), { x: good });
    assert.throws(() => validateContent(parsed, { x: bad }));
    assert.throws(() => validateContent(parsed, {}));
    assert.throws(() => validateContent(parsed, { x: good, unknown: true }));
  }
});

test('root defaults validate and titled array items may omit their string type', () => {
  const parsed = form({ type: 'array', items: { anyOf: [{ const: 'a', title: 'A' }, { const: 'b', title: 'B' }] } });
  assert.deepEqual(validateContent(parsed, { x: ['b'] }), { x: ['b'] });
  assert.throws(() => parseRequest({ server: 's', source: 'x', request: { message: '', requestedSchema: { type: 'object', properties: { x: { type: 'boolean' } }, required: ['x'], default: { x: 0 } } } }));
});

test('size and flat-property caps are enforced', () => {
  assert.throws(() => form({ type: 'string', default: 'a'.repeat(8193) }));
  const p = { type: 'string', enum: Array.from({ length: 10 }, (_, i) => `${i}${'a'.repeat(8000)}`) };
  assert.throws(() => form(p));
  assert.throws(() => parseRequest({ server: 's', source: 'x', request: { message: '', requestedSchema: { type: 'object', properties: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [String(i), { type: 'boolean' }])) } } }));
  assert.equal(display('\u001b]8;;evil\u0007\u202e'), '\\u001b]8;;evil\\u0007\\u202e');
});
