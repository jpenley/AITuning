const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, formatCents, sumCents } = require('../src/util/money');

test('toCents reads dollars and cents', () => {
  assert.equal(toCents('12.34'), 1234);
  assert.equal(toCents('5'), 500);
  assert.equal(toCents('0.5'), 50);
});

test('toCents rejects text that is not money', () => {
  assert.throws(() => toCents('12.345'));
  assert.throws(() => toCents('abc'));
});

test('formatCents prints dollars and cents', () => {
  assert.equal(formatCents(1234), '$12.34');
  assert.equal(formatCents(5), '$0.05');
});

test('sumCents adds whole cents', () => {
  assert.equal(sumCents([100, 250, 5]), 355);
});
