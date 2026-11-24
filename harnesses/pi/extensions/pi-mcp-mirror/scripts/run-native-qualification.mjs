// Qualification only: isolated equivalent of upstream test.sh's empty environment.
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runIsolated } from './run-isolated.mjs';

const [source, ...filters] = process.argv.slice(2);
if (!source || !filters.length) throw new Error('Usage: run-native-qualification.mjs PI_CHECKOUT VITEST_ARGS...');
const checkout = resolve(source);
const manifest = JSON.parse(await readFile(join(checkout, 'packages/coding-agent/package.json'), 'utf8'));
if (manifest.name !== '@earendil-works/pi-coding-agent') throw new Error('Expected an isolated Pi source checkout');
if (manifest.version !== '1.3.0') console.warn(`[pi-mcp-mirror] Pi ${manifest.version} compatibility is unknown; qualification baseline is 1.3.0. Attempting the checks.`);
process.exitCode = await runIsolated([join(checkout, 'node_modules/vitest/dist/cli.js'), '--run', ...filters], {
  cwd: join(checkout, 'packages/coding-agent'),
});
