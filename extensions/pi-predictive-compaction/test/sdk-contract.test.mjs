import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = process.env.PI_PREDICTIVE_SDK_ROOT;
assert.ok(root, 'PI_PREDICTIVE_SDK_ROOT identifies the qualified runtime');
const sdk = await import(pathToFileURL(join(root, 'dist/index.js')));

test('SDK exposes native preparation without starting or aborting an agent', () => {
  assert.equal(typeof sdk.prepareCompaction, 'function');
});
