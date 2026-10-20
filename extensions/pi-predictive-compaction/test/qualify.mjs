import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceHashes } from '../src/qualification.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [source, destination] = process.argv.slice(2);
if (!source || !destination || existsSync(destination)) throw new Error('Usage: node test/qualify.mjs <installed-pi-root> <fresh-receipt-directory>');
mkdirSync(destination, { recursive: true });
const runtime = join(resolve(destination), 'runtime');
function run(name, args, env) {
  const result = spawnSync(process.execPath, args, { cwd: base, env: { ...process.env, PI_TELEMETRY: '0', ...env }, encoding: 'utf8', timeout: 180000, windowsHide: true });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(join(destination, name + '.log'), output);
  if (result.error) throw result.error;
  if (result.status !== 0) { process.stderr.write(output); throw new Error(`${name} exited ${result.status}`); }
  return output;
}
try {
  const sources = sourceHashes(base);
  run('prepare', ['test/prepare-runtime.mjs', source, runtime]);
  const output = run('tests', ['--test', '--test-timeout=20000', '--test-reporter=tap', 'test/*.test.mjs'], { PI_PREDICTIVE_SDK_ROOT: runtime });
  const passed = Number(output.match(/^# pass (\d+)$/m)?.[1]), failed = Number(output.match(/^# fail (\d+)$/m)?.[1]);
  if (!(passed > 0) || failed !== 0) throw new Error('Test output did not establish a passing suite');
  if (JSON.stringify(sources) !== JSON.stringify(sourceHashes(base))) throw new Error('Source changed while tests ran');
  const receipt = { version: 1, sdkVersion: 1, completedAt: new Date().toISOString(), exitCode: 0, passed, failed, sources, runtimeManifest: JSON.parse(readFileSync(join(runtime, 'qualification-manifest.json'))) };
  writeFileSync(join(destination, 'qualification.json'), JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ ok: true, passed, failed, receipt: join(resolve(destination), 'qualification.json') }) + '\n');
} catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
