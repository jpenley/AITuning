// Run every checked-in Node suite with only synthetic profiles/credentials.
import { readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIsolated } from './run-isolated.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.SDK_ROOT || !process.env.RPIV_ROOT) throw new Error('Set SDK_ROOT and RPIV_ROOT to the qualified local package roots');
const sdk = await realpath(process.env.SDK_ROOT), rpiv = await realpath(process.env.RPIV_ROOT);
for (const [path, name, version] of [[sdk, '@earendil-works/pi-coding-agent', '1.3.0'], [rpiv, '@juicesharp/rpiv-ask-user-question', '2.13.9']]) {
  const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  if (pkg.name !== name || pkg.version !== version) throw new Error(`Unqualified package: expected ${name}@${version}`);
}
const control = process.env.MIRROR_CONTROL ?? 'mirror';
if (!['mirror', 'native'].includes(control)) throw new Error('MIRROR_CONTROL must be mirror or native');
const selected = process.argv.slice(2);
const tests = selected.length ? selected : (await readdir(join(root, 'test')))
  .filter(name => name.endsWith('.test.mjs')).sort().map(name => join(root, 'test', name));
if (!tests.length) throw new Error('No qualification tests found');
process.exitCode = await runIsolated(['--test', '--test-concurrency=1', ...tests], {
  cwd: root, resources: { SDK_ROOT: sdk, RPIV_ROOT: rpiv, MIRROR_CONTROL: control },
});
