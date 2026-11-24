# Tools for TypeScript/Node guardrails

Defaults for a row the inventory found empty, and the facts that commonly trip a setup. Checked against the official docs listed in [SOURCES.md](SOURCES.md) on 2026-09-27; versions move, so re-check a page before pinning a version from it.

## Package manager

Use the manager the lockfile names, for every command in scripts, hooks, and CI.

| Lockfile | Manager | CI install (fails instead of changing the lockfile) |
|---|---|---|
| `package-lock.json` / `npm-shrinkwrap.json` | npm | `npm ci` |
| `pnpm-lock.yaml` | pnpm | `pnpm install --frozen-lockfile` (already the default in CI) |
| `yarn.lock` with `.yarnrc.yml` (Yarn 2+) | Yarn | `yarn install --immutable` (already the default in CI) |
| `bun.lock` (text, Bun 1.2+) / `bun.lockb` (legacy) | Bun | `bun ci` (Bun does **not** freeze by default in CI) |

`packageManager` in `package.json` (for example `"pnpm@10.12.1"`) pins the version; `pnpm/action-setup` and `oven-sh/setup-bun` read it. Corepack ships with Node up to 24 but not from Node 25; don't make a gate depend on it being present.

## Typecheck

- Command: `tsc --noEmit` (for a single project), or `tsc -b` for a repo with project `references`. Since TypeScript 5.6, `--build` keeps building past errors in intermediate projects; the proof step shows whether the command still exits non-zero.
- `strict: true` turns on the whole strict family (`noImplicitAny`, `strictNullChecks`, ...). TypeScript 6.0 made `strict` the default, and made `types` default to `[]`, so a project on 6+ lists `"types": ["node"]` or Node globals stop resolving.
- Stricter, opt-in: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. `verbatimModuleSyntax` / `isolatedModules` matter when a single-file transpiler (esbuild, tsx, swc, Node's type stripping) runs the code.
- TypeScript 7.0 (July 2026) is the native port: `npm install -D typescript` installs it and its `tsc`. It ships no compiler API yet, so tools that need one (typescript-eslint's type-aware rules, some framework tooling) use TypeScript 6 installed side by side as `@typescript/typescript6`; follow the 7.0 announcement for the alias setup.

## Lint: ESLint + typescript-eslint

ESLint 10 reads only flat config (`eslint.config.js` / `.mjs` / `.cjs` / `.ts` / `.mts` / `.cts`); `.eslintrc*` files are ignored. `tseslint.config()` is deprecated in favour of ESLint's `defineConfig`.

```js
// eslint.config.mjs
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import prettier from "eslint-config-prettier/flat"; // only when Prettier formats

export default defineConfig([
  globalIgnores(["dist/", "coverage/"]),
  js.configs.recommended,
  tseslint.configs.recommended, // or recommendedTypeChecked, below
  comments.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: { "@eslint-community/eslint-comments/require-description": "error" },
  },
  prettier, // last, so it switches off rules that fight the formatter
]);
```

- Install: `eslint @eslint/js typescript-eslint` (plus the two optional packages above) as devDependencies.
- Command: `eslint . --max-warnings 0`. Without `--max-warnings 0`, warnings never fail the run.
- Type-aware rules (`no-floating-promises` and the rest of `recommendedTypeChecked` / `strictTypeChecked`) need `languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } }`. They are slower; keep them out of the pre-commit hook if they take more than a few seconds, and run them in CI.
- `--cache` doesn't track cross-file type information, so a cached run can miss type-aware results: never cache in CI.
- The floor ("no new suppression comments") in rules: `@typescript-eslint/ban-ts-comment` (in `recommended`) blocks `@ts-ignore` and requires a description on `@ts-expect-error`; `reportUnusedDisableDirectives: "error"` fails stale `eslint-disable` comments; the eslint-comments plugin's `no-unlimited-disable` and `require-description` block blanket and unexplained ones. New suppressions in the diff are still caught by the floor guard in the `audit` skill.

## Lint and format: Biome

When `biome.json` exists, Biome is the linter and formatter: `biome ci` checks formatting and lint without writing, for CI; `biome check` locally (`--write` applies safe fixes). Don't add ESLint or Prettier alongside it unless the user asks for a rule Biome lacks.
## Format: Prettier

`prettier --check .` exits 1 when a file isn't formatted (2 on a Prettier error); `prettier --write .` fixes. It reads `.gitignore` and `.prettierignore`.

## Tests

| Runner | Single-run command | Coverage gate |
|---|---|---|
| Vitest | `vitest run` (bare `vitest` watches in an interactive terminal) | `test.coverage.thresholds` in the Vitest config (`lines`, `functions`, `branches`, `statements`) |
| Jest | `jest --ci` (fails on a missing snapshot instead of writing it) | `coverageThreshold.global` in the Jest config |
| node:test | `node --test` (Node 24 strips types, so it finds `*.test.ts`) | `--experimental-test-coverage --test-coverage-lines=<n>` (coverage is still experimental) |

## Pre-commit hook

Keep the manager the repo already has. Otherwise:

- **husky + lint-staged**: `pnpm add -D husky lint-staged` (the project's manager), then `npx husky init`, which writes `.husky/pre-commit` and a `prepare` script. Replace the hook's body with the staged-files command and the typecheck, for example `pnpm exec lint-staged` then `pnpm typecheck`. `HUSKY=0` skips hooks, which is why CI is the real gate.
- **lint-staged** config (in `package.json` under `"lint-staged"`, or `lint-staged.config.js`): run the linter and formatter on the staged files. Never pass file names to `tsc`: it then ignores `tsconfig.json`. If tsc runs from lint-staged, use a function that returns the whole-project command, `"**/*.ts?(x)": () => "tsc -p tsconfig.json --noEmit"`.
- **lefthook** (`lefthook.yml`, installed with `lefthook install`): `pre-commit` jobs with `glob`, `{staged_files}`, and `stage_fixed: true` to re-stage auto-fixed files.
- **simple-git-hooks**: `"simple-git-hooks": { "pre-commit": "npx lint-staged" }` in `package.json`, applied by `npx simple-git-hooks` in `prepare`.

## CI: GitHub Actions

```yaml
# .github/workflows/check.yml
name: check
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v<current>
      - uses: pnpm/action-setup@v<current>   # pnpm only; reads packageManager
      - uses: actions/setup-node@v<current>
        with:
          node-version-file: package.json   # or .nvmrc / .node-version, whichever the repo has
          cache: pnpm                       # npm | yarn | pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test
```

- Take each action's current major version from its releases page when writing the file (see SOURCES.md); don't copy a version from memory.
- pnpm must be installed before `setup-node` so its cache works. For npm, `setup-node` caches automatically when `packageManager` names npm; for Bun, use `oven-sh/setup-bun` instead of `setup-node`.
- `node-version-file` accepts `package.json` (it reads `volta.node`, then `devEngines.runtime`, then `engines.node`), `.nvmrc`, `.node-version`, `.tool-versions`, `mise.toml`.
- **Required**: branch protection or a ruleset on the default branch with "Require status checks to pass", naming the job (`check` above). A required check passes on `success`, `skipped`, or `neutral`, so a job skipped by an `if:` or a path filter doesn't block: keep the gate job unconditional.
