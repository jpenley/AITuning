const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCsv } = require('../src/services/buildCsv');

const row = (over = {}) => ({ number: 'INV-1', customer: 'Northwind', total: 12.5, issued: '2026-09-01', ...over });

test('writes a header and one CRLF line per invoice', () => {
  assert.equal(buildCsv([row(), row({ number: 'INV-2' })]).split('\r\n').length, 3);
});

test('starts with the header', () => {
  assert.ok(buildCsv([]).startsWith('number,customer,total,issued'));
});

test('quotes commas and doubles quotes', () => {
  assert.ok(buildCsv([row({ customer: 'Acme, "Ltd"' })]).includes('"Acme, ""Ltd"""'));
});

test('neutralises a leading =', () => {
  assert.ok(buildCsv([row({ customer: '=HYPERLINK("http://x")' })]).includes(`"'=HYPERLINK(""http://x"")"`));
});
