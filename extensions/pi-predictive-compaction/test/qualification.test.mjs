import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { sourceHashes, validateQualification } from '../src/qualification.mjs';

test('installation gate rejects failed, empty and stale test evidence', () => {
  const base = resolve('.');
  const receipt = { version: 1, exitCode: 0, failed: 0, passed: 1, sdkVersion: 1, sources: sourceHashes(base) };
  assert.equal(validateQualification(receipt, base), receipt);
  for (const fault of [{ exitCode: 1 }, { failed: 1 }, { passed: 0 }, { sdkVersion: 0 }, { sources: {} }]) assert.throws(() => validateQualification({ ...receipt, ...fault }, base), /required|Source changed/);
});
