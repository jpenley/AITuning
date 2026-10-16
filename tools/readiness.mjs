// Read-only discovery. No subprocesses, networking, configuration reads or filesystem writes.
import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, posix, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function inspect({ catalog, selected = ['core'], all = false, project = process.cwd(), base = dirname(HERE), env = process.env,
  platform = process.platform, home = homedir(), nodeVersion = process.versions.node, file = regularFile }) {
  if (catalog.schemaVersion !== 1 || catalog.nodeMinimum !== 24 || !catalog.workflows?.core || !Array.isArray(catalog.dependencies)) throw new Error('invalid dependency catalog');
  const paths = platform === 'win32' ? win32 : posix;
  const groups = [...new Set(all ? Object.keys(catalog.workflows) : selected)];
  if (groups.some((id) => !Object.hasOwn(catalog.workflows, id))) throw new Error('unknown workflow selector');
  const ids = new Set();
  const checks = catalog.dependencies.filter((item) => {
    if (typeof item.id !== 'string' || ids.has(item.id) || !['runtime', 'command', 'browser', 'artifact', 'imagegen', 'manual'].includes(item.kind) ||
        !Array.isArray(item.required) || !Array.isArray(item.optional) || [...item.required, ...item.optional].some((id) => id !== '*' && !Object.hasOwn(catalog.workflows, id))) throw new Error('invalid dependency entry');
    ids.add(item.id);
    return [...item.required, ...item.optional].some((id) => id === '*' || groups.includes(id));
  }).map((item) => {
    const requiredFor = item.required.includes('*') ? groups : item.required.filter((id) => groups.includes(id));
    const optionalFor = item.optional.includes('*') ? groups : item.optional.filter((id) => groups.includes(id));
    let result;
    if (item.kind === 'manual') result = { availability: 'unverified', configuration: 'not-inspected', evidence: 'Confirm in the client or project; settings and credentials are not read.' };
    else if (item.kind === 'runtime') result = { availability: Number(nodeVersion.split('.')[0]) >= catalog.nodeMinimum ? 'available' : 'missing', version: nodeVersion, evidence: 'Running Node process; no version command launched.' };
    else if (item.kind === 'artifact') {
      if (!Array.isArray(item.bundleFiles) || !item.bundleFiles.length || item.bundleFiles.some((name) => paths.isAbsolute(name) || name.split(/[\\/]/).includes('..'))) throw new Error('invalid bundled artifact path');
      const states = item.bundleFiles.map((name) => file(paths.resolve(base, name), false));
      result = { availability: states.every((state) => state === 'file') ? 'available' : states.some((state) => state === 'unverified') ? 'unverified' : 'missing', evidence: 'Required bundled files checked by metadata.' };
    } else {
      let candidates = [];
      if (item.kind === 'imagegen') {
        const codex = env.CODEX_HOME || paths.join(home, '.codex');
        const roots = [env.IMAGEGEN_SKILL_ROOT, paths.join(codex, 'skills/.system/imagegen'), paths.join(codex, 'skills/imagegen')].filter(Boolean);
        let uncertain = false;
        result = { availability: 'missing', evidence: 'Complete system imagegen folder not found.' };
        for (const root of roots) {
          const states = ['SKILL.md', 'scripts/image_gen.py'].map((name) => file(paths.resolve(root, name), false));
          if (states.every((state) => state === 'file')) { result = { availability: 'available', location: root, evidence: 'Skill and CLI files found; neither was executed.' }; break; }
          uncertain ||= states.includes('unverified');
        }
        if (result.availability === 'missing' && uncertain) result = { availability: 'unverified', evidence: 'A candidate folder could not be inspected.' };
      } else {
        if (!Array.isArray(item.commands) || item.commands.some((name) => !/^[a-zA-Z0-9_-]+$/.test(name))) throw new Error('invalid command catalog');
        const suffixes = platform === 'win32' ? ['', '.exe', '.cmd', '.bat', '.com'] : [''];
        const directories = (env.PATH || '').split(platform === 'win32' ? ';' : ':').map((name) => name.trim().replace(/^"(.*)"$/, '$1')).filter((name) => paths.isAbsolute(name) && !/^(?:\\\\|\/\/)/.test(name));
        for (const name of item.commands) {
          for (const dir of [paths.join(project, 'node_modules/.bin'), ...directories]) for (const suffix of suffixes) candidates.push({ path: paths.join(dir, name + suffix), executable: true });
        }
        for (const name of item.projectFiles || []) candidates.unshift({ path: paths.resolve(project, name), executable: false });
        if (item.kind === 'browser') {
          const defaults = platform === 'win32'
            ? [env.PROGRAMFILES && paths.join(env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'), env.PROGRAMFILES && paths.join(env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'), env['PROGRAMFILES(X86)'] && paths.join(env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'), env.LOCALAPPDATA && paths.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')]
            : platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'] : [];
          for (const path of [env.FLOWSTATE_BROWSER, env.TRAJECTORY_BROWSER, ...defaults].filter(Boolean)) candidates.unshift({ path, executable: true });
        }
        if (item.id === 'mermaid' && env.MMDC) candidates.unshift({ path: paths.resolve(project, env.MMDC), executable: !/\.[cm]?js$/i.test(env.MMDC) });
        let uncertain = false;
        result = { availability: 'missing', evidence: 'No matching local executable file found.' };
        for (const candidate of candidates) {
          const state = file(candidate.path, candidate.executable);
          if (state === 'file') { result = { availability: 'available', location: candidate.path, evidence: 'File discovery only; executable and version were not run.' }; break; }
          uncertain ||= state === 'unverified';
        }
        if (result.availability === 'missing' && uncertain) result = { availability: 'unverified', evidence: 'A candidate file could not be inspected.' };
      }
    }
    return { id: item.id, name: item.name, requiredFor, optionalFor, ...result, note: item.note };
  });
  const blockers = checks.filter((item) => item.requiredFor.length && item.availability !== 'available');
  return { ok: blockers.length === 0, mode: 'discovery', workflows: groups, checks, blockers: blockers.map((item) => item.id),
    limits: ['No tools or providers executed.', 'Only the running Node version is verified.', 'Client registration, credentials, package dependencies and project checks remain unverified.'] };
}

function regularFile(path, executable) {
  if (/^(?:\\\\|\/\/)/.test(String(path))) return 'unverified';
  try {
    if (!statSync(path).isFile()) return 'missing';
    if (executable && process.platform !== 'win32') accessSync(path, constants.X_OK);
    return 'file';
  } catch (error) {
    return ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'missing' : 'unverified';
  }
}

function selftest() {
  const catalog = { schemaVersion: 1, nodeMinimum: 24, workflows: { core: 'Core', diagram: 'Diagram', jev: 'Jev' }, dependencies: [
    { id: 'node', kind: 'runtime', required: ['*'], optional: [] },
    { id: 'git', kind: 'command', commands: ['git'], required: ['core'], optional: [] },
    { id: 'renderer', kind: 'command', commands: ['mmdc'], required: ['diagram'], optional: [] },
    { id: 'service', kind: 'manual', required: ['jev'], optional: ['core'] }
  ] };
  const run = (opts = {}) => inspect({ catalog, project: '/project', base: '/bundle', platform: 'linux', env: { PATH: '/tools' }, home: '/user', nodeVersion: '24.0.0', file: (path) => path === '/tools/git' ? 'file' : 'missing', ...opts });
  let assertions = 0;
  const check = (ok, name) => { assertions++; if (!ok) throw new Error('selftest: ' + name); };
  check(run().ok, 'available core and optional unverified service');
  check(run({ file: () => 'missing' }).blockers.join() === 'git', 'missing executable blocks');
  check(run({ nodeVersion: '23.0.0' }).blockers.join() === 'node', 'unsupported Node blocks');
  check(run({ selected: ['diagram'] }).blockers.join() === 'renderer', 'selected workflow only');
  check(run({ selected: ['jev'] }).blockers.join() === 'service', 'unverified required service blocks');
  check(run({ file: () => 'unverified' }).checks.find((item) => item.id === 'git').availability === 'unverified', 'permission errors stay unknown');
  const windows = run({ platform: 'win32', project: 'C:\\project', env: { PATH: '"C:\\Program Files\\Tools"' }, file: (path) => path === 'C:\\Program Files\\Tools\\git.exe' ? 'file' : 'missing' });
  check(windows.ok, 'quoted Windows PATH and executable suffix');
  check(run({ file: (path) => path === '/project/node_modules/.bin/git' ? 'file' : 'missing' }).ok, 'project-local executable discovery');
  let rejected = false;
  try { run({ selected: ['unknown'] }); } catch (error) { rejected = error.message === 'unknown workflow selector'; }
  check(rejected, 'unknown selector rejected');
  const artifacts = { ...catalog, dependencies: [...catalog.dependencies, { id: 'files', kind: 'artifact', bundleFiles: ['one', 'two'], required: ['diagram'], optional: [] }] };
  check(run({ catalog: artifacts, selected: ['diagram'], file: (path) => ['/tools/git', '/tools/mmdc', '/bundle/one'].includes(path) ? 'file' : 'missing' }).blockers.join() === 'files', 'partial bundled artifact blocks');
  const images = { ...catalog, dependencies: [...catalog.dependencies, { id: 'image', kind: 'imagegen', required: ['diagram'], optional: [] }] };
  check(run({ catalog: images, selected: ['diagram'], env: { PATH: '/tools', IMAGEGEN_SKILL_ROOT: '/images' }, file: (path) => ['/tools/git', '/tools/mmdc', '/images/SKILL.md'].includes(path) ? 'file' : 'missing' }).blockers.join() === 'image', 'partial imagegen installation blocks');
  check(!run({ env: { PATH: 'relative-directory' } }).ok, 'relative PATH entry ignored');
  check(run({ selected: ['diagram'], file: (path) => path === '/tools/mmdc' ? 'file' : 'missing' }).ok, 'unrelated engineering Git is not required');
  return { ok: true, mode: 'selftest', assertions };
}

function main(args) {
  if (args.length === 1 && args[0] === '--selftest') return selftest();
  const catalog = JSON.parse(readFileSync(new URL('./dependencies.json', import.meta.url), 'utf8'));
  if (args.length === 1 && args[0] === '--list') return { ok: true, workflows: catalog.workflows };
  if (args.length === 1 && args[0] === '--help') return { ok: true, usage: 'node tools/readiness.mjs [--for workflow,... | --all] [--project directory] | --list | --selftest', exits: { 0: 'Selected local requirements found; see limits.', 1: 'Required items missing or unverified.', 2: 'Invalid input or checker could not run.' } };
  let selected = ['core'];
  let all = false;
  let project = process.cwd();
  let explicit = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--all' && !all && !explicit) all = true;
    else if (arg === '--for' && !all && !explicit && args[index + 1] && !args[index + 1].startsWith('--')) { selected = args[++index].split(','); explicit = true; }
    else if (arg === '--project' && args[index + 1] && !args[index + 1].startsWith('--')) project = args[++index];
    else throw new Error('invalid readiness option; use --help');
  }
  if (/^(?:\\\\|\/\/)/.test(project) || !statSync(project).isDirectory()) throw new Error('project directory is unavailable');
  return inspect({ catalog, selected, all, project: (process.platform === 'win32' ? win32 : posix).resolve(project) });
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    const result = main(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result) + '\n');
    process.stderr.write(`readiness: ${result.ok ? 'local discovery complete' : 'requirements need attention'}; no tools executed\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    const message = error.code ? 'readiness input could not be inspected' : error instanceof SyntaxError ? 'invalid dependency catalog' : error.message;
    process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
    process.stderr.write('readiness: could not run; use --help\n');
    process.exitCode = 2;
  }
}
