import { cpSync, mkdirSync, writeFileSync, symlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applySdkSupport, planSdkSupport } from '../sdk-support.mjs';

const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error('Usage: prepare-runtime.mjs <installed-pi-root> <fresh-test-root>');
if (existsSync(target)) throw new Error('Qualification requires a fresh runtime directory');
const sourcePlan = planSdkSupport(source);
mkdirSync(target, { recursive: true });
cpSync(join(source, 'dist'), join(target, 'dist'), { recursive: true });
cpSync(join(source, 'package.json'), join(target, 'package.json'));
// Rebuild from verified original bytes when qualifying an already patched installation.
for (const item of sourcePlan) writeFileSync(join(target, item.path), item.before);
symlinkSync(resolve(source, '../..'), join(target, 'node_modules'), 'junction');
const files = applySdkSupport(target);
const manifest = { version: 1, source, target: resolve(target), files };
writeFileSync(join(target, 'qualification-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// Reapplication is a no-op, and every patched byte is checked against its backup.
if (JSON.stringify(files) !== JSON.stringify(applySdkSupport(target))) throw new Error('SDK patch is not idempotent');
process.stdout.write(JSON.stringify({ ok: true, ...manifest, version: JSON.parse(readFileSync(join(target, 'package.json'))).version }) + '\n');
