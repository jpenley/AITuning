import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sha } from '../sdk-support.mjs';

export function sourceHashes(base) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', '.test-tmp', '.git'].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:mjs|ts)$/.test(entry.name) || entry.name === 'package.json') files.push(path);
    }
  }
  walk(base);
  return Object.fromEntries(files.sort().map(path => [relative(base, path).replaceAll('\\', '/'), sha(readFileSync(path))]));
}

export function validateQualification(receipt, base) {
  if (receipt.version !== 1 || receipt.exitCode !== 0 || receipt.failed !== 0 || !(receipt.passed > 0) || receipt.sdkVersion !== 1) throw new Error('A passing predictive-compaction qualification is required');
  if (JSON.stringify(receipt.sources) !== JSON.stringify(sourceHashes(base))) throw new Error('Source changed after qualification; rerun the tests before installation');
  return receipt;
}
