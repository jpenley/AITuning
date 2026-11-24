// checker-config.mjs: which files hold checker config (linter, formatter, type-checker, coverage) and whether a
// change to one touches it. Shared by the floor guard (after the fact, from git) and harnesses/shared/hooks/config-guard.mjs (live,
// before an edit). Adapted from affaan-m/ECC (MIT), scripts/hooks/config-protection.js; the mixed-file handling is
// this repo's.
//   Checker files (CHECKER_FILES): the whole file is checker config, so any change to an existing one counts.
//   Mixed files: only their checker parts count. Adding checker config where there was none does not.
//   tsconfig: the direction is known, so only weakening counts.
import { basename } from 'node:path';

const any = (...names) => names;
const CHECKER_FILES = new Set([
  // JavaScript and TypeScript
  ...any('.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml'),
  ...any('eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts'),
  ...any('.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.json', '.prettierrc.json5', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.toml'),
  ...any('prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs', 'prettier.config.ts', '.prettierignore', '.eslintignore'),
  ...any('biome.json', 'biome.jsonc', '.oxlintrc.json', 'deno.lint.json'),
  ...any('.stylelintrc', '.stylelintrc.json', '.stylelintrc.yml', '.stylelintrc.yaml', '.stylelintrc.js', 'stylelint.config.js', 'stylelint.config.mjs', 'stylelint.config.cjs'),
  // Python
  ...any('ruff.toml', '.ruff.toml', 'mypy.ini', '.mypy.ini', '.flake8', '.pylintrc', 'pylintrc', 'pyrightconfig.json', '.isort.cfg', '.coveragerc', '.bandit'),
  // Rust
  ...any('rustfmt.toml', '.rustfmt.toml', 'clippy.toml', '.clippy.toml', 'deny.toml'),
  // .NET (analyzer severities live in .editorconfig and .globalconfig)
  ...any('.editorconfig', '.globalconfig', 'stylecop.json', 'directory.build.rsp'),
  // Shell, Markdown, YAML, containers, other languages, and the pre-commit runner
  ...any('.shellcheckrc', '.markdownlint.json', '.markdownlint.jsonc', '.markdownlint.yaml', '.markdownlint.yml', '.markdownlintrc', '.markdownlint-cli2.jsonc', '.markdownlint-cli2.yaml'),
  ...any('.yamllint', '.yamllint.yml', '.yamllint.yaml', '.hadolint.yaml', '.hadolint.yml', '.golangci.yml', '.golangci.yaml', '.golangci.toml'),
  ...any('.rubocop.yml', '.swiftlint.yml', '.clang-format', '.clang-tidy', 'checkstyle.xml', 'detekt.yml', '.pre-commit-config.yaml'),
  ...any('lefthook.yml', 'lefthook.yaml', 'lefthook.json', 'lefthook.toml', '.lefthook.yml', '.lefthook.yaml', '.lefthook.json', '.lefthook.toml'),
]);
const CHECKER_PATTERNS = [/\.ruleset$/i]; // .NET code-analysis rule sets

// Mixed files: name test -> extractor returning the checker parts as a comparable string ('' when none).
const TOML_SECTIONS = {
  'pyproject.toml': /^tool\.(ruff|mypy|pyright|black|isort|pylint|flake8|coverage|bandit|pydocstyle|pytype|basedpyright)(\.|$)/,
  'cargo.toml': /^(workspace\.)?lints(\.|$)/,
};
const INI_SECTIONS = /^(flake8|mypy(-.*)?|isort|pylint(\..*)?|pycodestyle|pydocstyle|coverage:.*|bandit)$/i;
const PACKAGE_KEYS = ['eslintConfig', 'prettier', 'stylelint', 'markdownlint', 'eslintIgnore'];
// tsconfig: flags where true is stricter, and flags where true is looser.
const TS_STRICT = ['strict', 'noImplicitAny', 'strictNullChecks', 'strictFunctionTypes', 'strictBindCallApply', 'strictPropertyInitialization', 'noImplicitThis', 'useUnknownInCatchVariables', 'alwaysStrict', 'noUnusedLocals', 'noUnusedParameters', 'noImplicitReturns', 'noFallthroughCasesInSwitch', 'noUncheckedIndexedAccess', 'noImplicitOverride', 'noPropertyAccessFromIndexSignature', 'exactOptionalPropertyTypes', 'allowUnreachableCode:false', 'allowUnusedLabels:false', 'checkJs', 'forceConsistentCasingInFileNames', 'isolatedModules', 'verbatimModuleSyntax', 'noEmitOnError'];
const TS_LOOSE = ['skipLibCheck', 'skipDefaultLibCheck', 'suppressImplicitAnyIndexErrors', 'suppressExcessPropertyErrors', 'noStrictGenericChecks', 'keyofStringsOnly'];
const MSBUILD_PROPS = ['TreatWarningsAsErrors', 'WarningsAsErrors', 'WarningsNotAsErrors', 'NoWarn', 'Nullable', 'WarningLevel', 'AnalysisLevel', 'AnalysisMode', 'EnableNETAnalyzers', 'EnforceCodeStyleInBuild', 'CodeAnalysisRuleSet', 'CodeAnalysisTreatWarningsAsErrors', 'RunAnalyzers', 'RunAnalyzersDuringBuild', 'GenerateDocumentationFile'];

function tomlParts(text, re) {
  const out = [];
  let keep = false;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const h = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
    if (h) keep = re.test(h[1].replace(/["']/g, ''));
    if (keep && line.trim() && !/^\s*#/.test(line)) out.push(line.trim());
  }
  return out.join('\n');
}
function iniParts(text) {
  const out = [];
  let keep = false;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const h = line.match(/^\s*\[([^\]]+)\]/);
    if (h) keep = INI_SECTIONS.test(h[1].trim());
    if (keep && line.trim() && !/^\s*[#;]/.test(line)) out.push(line.trim());
  }
  return out.join('\n');
}
const stripJsonc = (t) => t.replace(/"(?:[^"\\]|\\.)*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) => (m[0] === '"' ? m : '')).replace(/,(\s*[}\]])/g, '$1');
function packageParts(text) {
  const pkg = JSON.parse(text);
  const parts = PACKAGE_KEYS.filter((k) => pkg[k] !== undefined).map((k) => `${k}=${JSON.stringify(pkg[k])}`);
  return parts.join('\n');
}
// tsconfig: a score per flag, so the comparison can tell tightening from weakening.
function tsFlags(text) {
  const opts = JSON.parse(stripJsonc(text))?.compilerOptions ?? {};
  const flags = {};
  const strict = opts.strict === true;
  for (const f of TS_STRICT) {
    const [k, want] = f.includes(':') ? [f.split(':')[0], f.split(':')[1] === 'true'] : [f, true];
    // Flags in the strict family default to the value of "strict".
    const family = k.startsWith('strict') || ['noImplicitAny', 'noImplicitThis', 'useUnknownInCatchVariables', 'alwaysStrict'].includes(k);
    const v = opts[k] ?? (family && k !== 'strict' ? strict : undefined);
    flags[k] = v === want;
  }
  for (const k of TS_LOOSE) flags[k] = opts[k] !== true;
  return flags;
}
function msbuildParts(text) {
  const out = [];
  for (const p of MSBUILD_PROPS) for (const m of text.matchAll(new RegExp(`<${p}(\\s[^>]*)?>([\\s\\S]*?)</${p}>`, 'g'))) out.push(`${p}=${m[2].trim()}`);
  return out.join('\n');
}

// What kind of guarded file this path is: { kind: 'checker' } | { kind: 'mixed', parts } | { kind: 'ts' } | null.
export function classify(path) {
  const name = basename(path).toLowerCase();
  if (name === 'constraints.md') return null;
  if (CHECKER_FILES.has(name) || CHECKER_PATTERNS.some((re) => re.test(name))) return { kind: 'checker' };
  if (TOML_SECTIONS[name]) return { kind: 'mixed', parts: (t) => tomlParts(t, TOML_SECTIONS[name]) };
  if (name === 'setup.cfg' || name === 'tox.ini') return { kind: 'mixed', parts: iniParts };
  if (name === 'package.json') return { kind: 'mixed', parts: packageParts };
  if (/^[jt]sconfig(\..+)?\.json$/.test(name)) return { kind: 'ts' };
  if (/\.(cs|fs|vb)proj$/.test(name) || /^directory\.build\.(props|targets)$/.test(name)) return { kind: 'mixed', parts: msbuildParts };
  return null;
}

// Why this change to path touches checker config, or null. before: current text (null if the file doesn't exist);
// after: the text once the change is applied (null when unknown, '' when deleted).
export function judge(path, before, after) {
  const c = classify(path);
  if (!c || before === null) return null; // not guarded, or a new file
  const name = basename(path);
  if (c.kind === 'checker') return `${name} is an existing linter, formatter, or checker config`;
  if (after === null) return null;
  try {
    if (c.kind === 'ts') {
      const was = tsFlags(before);
      let now;
      try { now = tsFlags(after); } catch { return `${name} would no longer parse, which drops its type-checking settings`; }
      const weaker = Object.keys(was).filter((k) => was[k] && !now[k]);
      return weaker.length ? `this change to ${name} loosens type checking (${weaker.join(', ')})` : null;
    }
    const was = c.parts(before);
    if (!was) return null; // no checker config there yet: adding some is allowed
    let now;
    try { now = c.parts(after); } catch { now = ''; }
    return was !== now ? `this change touches the checker settings in ${name}` : null;
  } catch {
    return null; // the current file doesn't parse: nothing reliable to compare
  }
}
