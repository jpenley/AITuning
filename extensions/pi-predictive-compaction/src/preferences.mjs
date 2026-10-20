import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function readPreferences(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (value.version !== 1 || typeof value.enabled !== 'boolean') throw new Error('Expected version 1 and boolean enabled');
    return { version: 1, enabled: value.enabled };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, enabled: false };
    throw new Error('Invalid predictive-compaction settings: ' + error.message);
  }
}

export function writePreferences(path, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
  mkdirSync(dirname(path), { recursive: true });
  const temp = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, JSON.stringify({ version: 1, enabled }, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, path);
}
