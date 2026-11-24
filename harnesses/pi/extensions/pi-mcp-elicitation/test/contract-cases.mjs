const request = (properties, extra = {}) => ({ message: 'Contract fixture', requestedSchema: { type: 'object', properties, required: Object.keys(properties), ...extra } });
export const contractCases = [
  { name: 'false is an explicit value', request: request({ flag: { type: 'boolean', default: true } }), supported: true, values: [{ content: { flag: false }, valid: true }, { content: {}, valid: false }] },
  { name: 'validated root default', request: request({ n: { type: 'integer' } }, { default: { n: 0 } }), supported: true, values: [{ content: { n: 0 }, valid: true }] },
  { name: 'invalid root default', request: request({ n: { type: 'integer' } }, { default: { n: '0' } }), supported: false },
  { name: 'known schema annotation', request: request({}, { $schema: 'https://json-schema.org/draft/2020-12/schema' }), supported: true, values: [{ content: {}, valid: true }] },
  { name: 'unknown schema annotation', request: request({}, { $schema: 'https://untrusted.invalid/schema' }), supported: false },
  { name: 'number outside supported exact range', request: request({ n: { type: 'number', default: 1e20 } }), supported: false },
  { name: 'number bound outside supported range', request: request({ n: { type: 'number', maximum: 1e20 } }), supported: false },
  { name: 'enum items need a string type', request: request({ tags: { type: 'array', items: { enum: ['a'] } } }), supported: false },
  { name: 'titled enum items may omit type', request: request({ tags: { type: 'array', items: { anyOf: [{ const: 'a', title: 'A' }] } } }), supported: true, values: [{ content: { tags: ['a'] }, valid: true }, { content: { tags: ['a', 'a'] }, valid: false }] },
  { name: 'enum selections are unique', request: request({ tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } } }), supported: true, values: [{ content: { tags: [] }, valid: true }, { content: { tags: ['a', 'a'] }, valid: false }] },
  { name: 'unreachable minimum selections', request: request({ tags: { type: 'array', minItems: 2, items: { type: 'string', enum: ['a'] } } }), supported: false },
  { name: 'array bound exceeds supported limit', request: request({ tags: { type: 'array', maxItems: 129, items: { type: 'string', enum: ['a'] } } }), supported: false },
  { name: 'string constraint exceeds supported limit', request: request({ text: { type: 'string', maxLength: 8193 } }), supported: false },
  { name: 'URI format uses escaped ASCII', request: request({ link: { type: 'string', format: 'uri' } }), supported: true, values: [{ content: { link: 'https://example.com/a%20b' }, valid: true }, { content: { link: 'https://example.com/<unsafe>' }, valid: false }, { content: { link: 'https://example.com/é' }, valid: false }] },
  { name: 'email domain may not start with dot', request: request({ email: { type: 'string', format: 'email' } }), supported: true, values: [{ content: { email: 'a@b.example' }, valid: true }, { content: { email: 'a@.b.example' }, valid: false }] },
  { name: 'calendar dates and timestamps', request: request({ when: { type: 'string', format: 'date-time' } }), supported: true, values: [{ content: { when: '2024-02-29T12:30:00Z' }, valid: true }, { content: { when: '2023-02-29T12:30:00Z' }, valid: false }] },
  { name: 'unsupported regex never executes', request: request({ text: { type: 'string', pattern: '(a+)+$' } }), supported: false },
];

contractCases.push(
  { name: 'null required is malformed', request: request({}, { required: null }), supported: false },
  { name: 'schema annotation is a string, not a singleton array', request: request({}, { $schema: ['https://json-schema.org/draft/2020-12/schema'] }), supported: false },
  { name: 'format annotation is a string, not a singleton array', request: request({ value: { type: 'string', format: ['email'] } }), supported: false },
);
// Independent boundary fixtures: 65,535-byte payloads leave less room than the bridge metadata.
const largeRequest = request(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`f${i}`, { type: 'boolean', description: 'd'.repeat(8192) }])));
largeRequest.message = 'm'.repeat(8192);
const requestExcess = Buffer.byteLength(JSON.stringify(largeRequest)) - 65535;
largeRequest.requestedSchema.properties.f6.description = 'd'.repeat(8192 - requestExcess);
contractCases.push({ name: 'request payload budget excludes bridge metadata', request: largeRequest, supported: true, values: [{ content: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`f${i}`, false])), valid: true }] });
const oversizedRequest = JSON.parse(JSON.stringify(largeRequest));
oversizedRequest.requestedSchema.properties.f6.description += 'd'.repeat(2);
contractCases.push({ name: 'request over payload budget is rejected', request: oversizedRequest, supported: false });
const largeContent = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`s${i}`, 'v'.repeat(8192)]));
const contentExcess = Buffer.byteLength(JSON.stringify(largeContent)) - 65535;
largeContent.s7 = 'v'.repeat(8192 - contentExcess);
export const responseBudgetCase = { name: 'content payload budget excludes action and collector envelopes', request: request(Object.fromEntries(Object.keys(largeContent).map(k => [k, { type: 'string' }]))), supported: true,
  values: [{ content: largeContent, valid: true }, { content: { ...largeContent, s7: largeContent.s7 + 'v'.repeat(2) }, valid: false }] };
contractCases.push(responseBudgetCase);
