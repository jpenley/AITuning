// Resolve host peers from the explicitly selected installation, not stale development peers.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.SDK_ROOT && await realpath(process.env.SDK_ROOT);
const compiler = join(root, 'node_modules/typescript/bin/tsc');
const args = ['--noEmit', '-p', join(root, 'tsconfig.json')];
let owned;
try {
  if (sdk) {
    const manifest = JSON.parse(await readFile(join(sdk, 'package.json'), 'utf8'));
    if (manifest.name !== '@earendil-works/pi-coding-agent') throw new Error('SDK_ROOT must name the Pi coding-agent package');
    const require = createRequire(join(sdk, 'package.json'));
    const paths = { '@earendil-works/pi-coding-agent': [join(sdk, 'dist/index.d.ts')] };
    // The declared file dependency may be a regular copy, not a workspace link.
    // Resolve its public source exports without suppressing implicit-any checks.
    const companion = resolve(root, '../pi-mcp-elicitation');
    const companionPackage = JSON.parse(await readFile(join(companion, 'package.json'), 'utf8'));
    if (companionPackage.name !== 'pi-mcp-elicitation') throw new Error('Invalid local companion package');
    for (const [name, subpath] of [['pi-mcp-elicitation', '.'], ['pi-mcp-elicitation/adapters', './adapters']]) {
      const target = companionPackage.exports?.[subpath];
      if (typeof target !== 'string') throw new Error(`Missing companion source export: ${subpath}`);
      paths[name] = [join(companion, target)];
    }
    for (const name of ['@earendil-works/pi-agent-core', '@earendil-works/pi-ai', '@earendil-works/pi-tui', 'typebox']) {
      const search = require.resolve.paths(name) ?? [];
      let dependency;
      for (const directory of search) {
        try {
          const candidate = join(directory, name);
          const pkg = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
          const exported = pkg.exports?.['.'];
          const target = typeof exported === 'object' ? exported.types : undefined;
          dependency = join(candidate, target ?? pkg.types ?? 'dist/index.d.ts');
          await readFile(dependency);
          break;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (!dependency) throw new Error(`Missing host types for ${name}`);
      paths[name] = [dependency];
    }
    console.log(`Typechecking against ${manifest.name}@${manifest.version} at ${sdk}`);
    owned = await mkdtemp(join(tmpdir(), 'pi-mcp-types-'));
    const config = join(owned, 'tsconfig.json');
    await writeFile(config, JSON.stringify({ extends: join(root, 'tsconfig.json'), compilerOptions: { paths, typeRoots: [join(root, 'node_modules/@types')] } }));
    args[2] = config;
  }
  const child = spawnSync(process.execPath, [compiler, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally { if (owned) await rm(owned, { recursive: true, force: true }); }
