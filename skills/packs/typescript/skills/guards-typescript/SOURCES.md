# Sources

Every command, config key, and version in [SKILL.md](SKILL.md) and [TOOLS.md](TOOLS.md) was checked against these pages on 2026-09-27. When a tool's behaviour matters to a gate, re-read its page: these move.

## TypeScript

- tsconfig reference (`strict` family, `noEmit`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`): https://www.typescriptlang.org/tsconfig/
- Project references and `tsc -b`: https://www.typescriptlang.org/docs/handbook/project-references.html
- TypeScript 5.6 (`--build` continues past intermediate errors, `--stopOnBuildErrors`): https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-6.html
- TypeScript 6.0 (new defaults: `strict`, `types: []`): https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- TypeScript 7.0 (native `tsc`, no API yet, `@typescript/typescript6` side by side): https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/

## Lint and format

- ESLint 10 migration (flat config only): https://eslint.org/docs/latest/use/migrate-to-10.0.0
- ESLint configuration files (`defineConfig`, `globalIgnores`, `reportUnusedDisableDirectives`): https://eslint.org/docs/latest/use/configure/configuration-files
- ESLint CLI (`--max-warnings`, `--cache`, `--report-unused-disable-directives`): https://eslint.org/docs/latest/use/command-line-interface
- typescript-eslint getting started: https://typescript-eslint.io/getting-started/
- typescript-eslint typed linting (`recommendedTypeChecked`, `projectService`): https://typescript-eslint.io/getting-started/typed-linting/
- `typescript-eslint` package (`config()` deprecated for `defineConfig`): https://typescript-eslint.io/packages/typescript-eslint/
- Parser options (`projectService`, `tsconfigRootDir`): https://typescript-eslint.io/packages/parser/
- `ban-ts-comment`: https://typescript-eslint.io/rules/ban-ts-comment/
- `no-floating-promises`: https://typescript-eslint.io/rules/no-floating-promises/
- eslint-comments plugin (flat config import, rule prefix, `no-unlimited-disable`, `require-description`): https://eslint-community.github.io/eslint-plugin-eslint-comments/
- Prettier CLI (`--check` exit codes, `--write`, ignore files): https://prettier.io/docs/cli
- eslint-config-prettier (`eslint-config-prettier/flat`, put it last): https://github.com/prettier/eslint-config-prettier
- Biome CLI (`biome check`, `biome ci`): https://biomejs.dev/reference/cli/

## Tests

- Vitest CLI (`vitest run`, watch in interactive terminals): https://vitest.dev/guide/cli
- Vitest coverage (`coverage.thresholds`): https://vitest.dev/config/coverage
- Jest CLI (`--ci`): https://jestjs.io/docs/cli
- Jest configuration (`coverageThreshold`): https://jestjs.io/docs/configuration
- node:test (coverage still experimental): https://nodejs.org/docs/latest-v24.x/api/test.html
- Node CLI (`--test-coverage-lines` and related): https://nodejs.org/docs/latest-v24.x/api/cli.html

## Package managers

- `npm ci`: https://docs.npmjs.com/cli/v11/commands/npm-ci
- `pnpm install` (`--frozen-lockfile`, default in CI): https://pnpm.io/cli/install
- `yarn install` (`--immutable`, default in CI): https://yarnpkg.com/cli/install
- Bun lockfile (`bun.lock` since 1.2): https://bun.com/docs/pm/lockfile
- `bun install` / `bun ci` (no automatic freeze in CI): https://bun.com/docs/pm/cli/install
- Corepack (bundled with Node before 25, `packageManager` field): https://github.com/nodejs/corepack

## Hooks

- husky get started (`husky init`, `prepare`, `HUSKY=0`): https://github.com/typicode/husky/blob/main/docs/get-started.md
- lint-staged (config locations, running tsc without file names): https://github.com/lint-staged/lint-staged
- simple-git-hooks: https://github.com/toplenboren/simple-git-hooks
- lefthook: https://lefthook.dev/

## CI

- actions/checkout (releases, v7): https://github.com/actions/checkout
- actions/setup-node (v7, `node-version-file`, `cache`, npm auto-cache, pnpm pre-installed): https://github.com/actions/setup-node
- setup-node advanced usage (fields read from `package.json`): https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md
- pnpm/action-setup (v6, reads `packageManager`): https://github.com/pnpm/action-setup
- oven-sh/setup-bun (v2): https://github.com/oven-sh/setup-bun
- Protected branches (required status checks; `success`, `skipped`, `neutral` pass): https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- Rulesets ("Require status checks to pass"): https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets

## Not verified

- Whether `tsc -b` exits non-zero when an intermediate project has errors under 5.6+ (the docs say it keeps building): the proof step settles it per repo.
- husky's default `.husky/pre-commit` body: the docs say only that init creates the hook running the test script, so the skill says to replace the body.
