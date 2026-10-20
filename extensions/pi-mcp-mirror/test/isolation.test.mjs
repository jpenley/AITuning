import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { runIsolated } from '../scripts/run-isolated.mjs';

// Break caught: a qualifier inherits arbitrary provider variables or global
// profiles/caches, or fails to remove its owned environment after child exit.
test('qualification launcher allowlists environment and removes the owned profile', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'mirror-isolation-probe-'));
  const proof = join(temp, 'proof.json');
  assert.equal(process.env.QUALIFICATION_SENTINEL, undefined);
  process.env.QUALIFICATION_SENTINEL = 'synthetic-inheritance-probe';
  try {
    const code = `
      const a = require('node:assert/strict'), fs = require('node:fs');
      const p = require('node:path'), os = require('node:os');
      a.equal(process.env.QUALIFICATION_SENTINEL, undefined);
      a.equal(process.env.PI_OFFLINE, '1');
      a.equal(process.env.SDK_ROOT, 'synthetic-sdk-root');
      a.equal(process.env.RPIV_ROOT, 'synthetic-rpiv-root');
      a.notEqual(process.env.HOME, 'forbidden-profile-override');
      const owned = p.dirname(os.tmpdir());
      for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PI_CODING_AGENT_DIR', 'JITI_FS_CACHE', 'NPM_CONFIG_CACHE'])
        a.equal(p.relative(owned, process.env[key]).startsWith('..'), false, key);
      a.equal(process.env.GIT_CONFIG_GLOBAL, os.devNull);
      fs.writeFileSync(process.argv[1], JSON.stringify({ owned }), 'utf8');
    `;
    assert.equal(await runIsolated(['-e', code, proof], { cwd: temp,
      resources: { SDK_ROOT: 'synthetic-sdk-root', RPIV_ROOT: 'synthetic-rpiv-root', HOME: 'forbidden-profile-override' },
    }), 0);
    const { owned } = JSON.parse(await readFile(proof, 'utf8'));
    assert.notEqual(owned, dirname(temp));
    await assert.rejects(stat(owned), { code: 'ENOENT' });
  } finally { delete process.env.QUALIFICATION_SENTINEL; await rm(temp, { recursive: true, force: true }); }
});
