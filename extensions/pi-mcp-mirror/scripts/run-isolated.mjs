// Qualification subprocesses inherit OS execution paths, not provider credentials.
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';

export async function runIsolated(args, { cwd, resources = {} }) {
  const owned = await mkdtemp(join(tmpdir(), 'pi-mirror-offline-'));
  try {
    for (const name of ['home', 'tmp', 'cache', 'agent', 'appdata', 'localappdata']) await mkdir(join(owned, name));
    await writeFile(join(owned, 'npm-config'), '', 'utf8');
    const env = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'CI', 'GITHUB_ACTIONS']) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    for (const key of ['SDK_ROOT', 'RPIV_ROOT', 'MIRROR_CONTROL']) {
      if (resources[key] !== undefined) env[key] = resources[key];
    }
    Object.assign(env, {
      HOME: join(owned, 'home'), USERPROFILE: join(owned, 'home'),
      APPDATA: join(owned, 'appdata'), LOCALAPPDATA: join(owned, 'localappdata'),
      TMP: join(owned, 'tmp'), TEMP: join(owned, 'tmp'), TMPDIR: join(owned, 'tmp'),
      XDG_CONFIG_HOME: join(owned, 'home'), XDG_CACHE_HOME: join(owned, 'cache'),
      JITI_FS_CACHE: join(owned, 'cache', 'jiti'),
      PI_CODING_AGENT_DIR: join(owned, 'agent'), PI_NO_LOCAL_LLM: '1', PI_OFFLINE: '1',
      TZ: 'UTC', LANG: 'C', LC_ALL: 'C',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull,
      GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true',
      NPM_CONFIG_USERCONFIG: join(owned, 'npm-config'), NPM_CONFIG_GLOBALCONFIG: join(owned, 'npm-config'),
      NPM_CONFIG_CACHE: join(owned, 'cache'), AWS_EC2_METADATA_DISABLED: 'true',
    });
    const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit', timeout: 200000, windowsHide: true });
    if (result.error) throw result.error;
    if (result.signal) console.error(`Qualification subprocess terminated by ${result.signal}`);
    return result.status ?? 1;
  } finally { await rm(owned, { recursive: true, force: true, maxRetries: 3 }); }
}
