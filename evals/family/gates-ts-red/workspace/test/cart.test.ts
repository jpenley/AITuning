import { test } from 'node:test';
import assert from 'node:assert/strict';
import { total } from '../src/cart.ts';

test('total multiplies price by quantity', () => {
  assert.equal(total([{ sku: 'A1', qty: 2 }]), 800);
});
