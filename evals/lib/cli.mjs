// Finding a harness binary (claude, codex, npx, pwsh) on PATH so it can be spawned without a shell.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, delimiter, dirname, join } from 'node:path';

export function which(name) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const d of (process.env.PATH ?? '').split(delimiter)) {
    if (!d) continue;
    for (const e of exts) {
      const p = join(d, name + e);
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
  }
  return null;
}

// npm's Windows .cmd shims can't be spawned without a shell, so run what they point at instead.
// Returns the argv prefix to spawn, or null when the command isn't found.
export function resolveCommand(name, locate = which) {
  const p = locate(name);
  if (!p) return null;
  if (!p.toLowerCase().endsWith('.cmd')) return [p];
  const shim = readFileSync(p, 'utf8');
  const candidates = [...shim.matchAll(/%(?:dp0%|~dp0)\\([^"%\r\n]+)/g)]
    .map((m) => join(dirname(p), m[1]))
    .filter((t) => !/[\\/]node\.exe$/i.test(t) && existsSync(t));
  // Modern npm shims name npm-prefix.js before the actual npm/npx entry point.
  const target = candidates.find(t => basename(t) === `${name}-cli.js`) ?? candidates.find(t => basename(t) !== 'npm-prefix.js');
  if (!target) return null;
  return target.toLowerCase().endsWith('.js') ? [process.execPath, target] : [target];
}
