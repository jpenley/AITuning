# Sources

Every command, config key, and rule in [SKILL.md](SKILL.md) and [TOOLS.md](TOOLS.md) was checked against these pages on 2026-09-27. Versions then: dependency-cruiser 18.4, madge 8.0, eslint-plugin-import 2.32, eslint-plugin-import-x 4.17, eslint-plugin-boundaries 7.2, @nx/eslint-plugin 23.2, turbo 2.11, knip 6.38.

## dependency-cruiser

- CLI (`--init`, default config pickup, `--config src` trap, output types, `--collapse`, `--focus`, `--reaches`, `--include-only`, `--baseline`, `--ignore-known`, exit code = error count, `metrics`): https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md
- Rules reference (`forbidden`, `severity`, `path`/`pathNot`, group matching with `$1`, `circular` with `via`/`viaOnly`, `dependencyTypes`/`dependencyTypesNot`, `reachable`, `couldNotResolve`): https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- Rules tutorial: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md
- Options reference (`tsPreCompilationDeps`, `tsConfig`, `enhancedResolveOptions`, `doNotFollow`, `preserveSymlinks`, `combinedDependencies`): https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md

## madge

- README and CLI source (`--circular`, `--extensions`, `--ts-config`, `--json`, `--depends`, `--orphans`, `--image`, exit 1 on cycles, `skipTypeImports`): https://github.com/pahen/madge and https://github.com/pahen/madge/blob/master/bin/cli.js

## ESLint rules

- `no-restricted-imports` (`patterns`, `group`, `regex`): https://eslint.org/docs/latest/rules/no-restricted-imports
- `import/no-cycle` (cost warning, type imports skipped): https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md
- `import/no-internal-modules`: https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-internal-modules.md
- `import/no-restricted-paths`: https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md
- eslint-plugin-import-x (fork, flat configs, `exports` support): https://github.com/un-ts/eslint-plugin-import-x
- eslint-plugin-boundaries v7 (`boundaries/dependencies`, deprecated rules, `fileInternalPath`): https://www.jsboundaries.dev/docs/rules/ and https://www.jsboundaries.dev/docs/rules/dependencies/

## Package interface and TypeScript

- Node packages (`exports` encapsulation, `ERR_PACKAGE_PATH_NOT_EXPORTED`, subpath patterns, `null`, condition order, `types` first): https://nodejs.org/api/packages.html
- TypeScript module reference (`exports` under `node16`/`nodenext`/`bundler`; `paths` skips `node_modules` lookups and `exports`; use workspaces instead of `paths` into monorepo packages): https://www.typescriptlang.org/docs/handbook/modules/reference.html
- `resolvePackageJsonExports`: https://www.typescriptlang.org/tsconfig/resolvePackageJsonExports.html
- Project references (`references`, `composite`, `tsc -b`, `.d.ts` output imports): https://www.typescriptlang.org/docs/handbook/project-references.html
- TS6307 / TS6059 message text (TypeScript 5.9 diagnostics): https://raw.githubusercontent.com/microsoft/TypeScript/v5.9.2/src/compiler/diagnosticMessages.json

## Monorepo tools

- Nx enforce module boundaries (tags, `depConstraints`): https://nx.dev/docs/features/enforce-module-boundaries
- Nx rule source (cycle and relative-import messages): https://github.com/nrwl/nx/blob/master/packages/eslint-plugin/src/rules/enforce-module-boundaries.ts
- Nx graph: https://nx.dev/docs/features/explore-graph
- Turborepo boundaries (experimental): https://turborepo.dev/docs/reference/boundaries
- pnpm workspaces (`workspace:` protocol): https://pnpm.io/workspaces
- Knip: https://knip.dev

## Not verified

- Counting fan-in/fan-out from madge's `--json` and `--depends` is an inference from what those flags print; only dependency-cruiser documents coupling metrics.
- The TS6307/TS6059 wording under TypeScript 7 (the native port).
- The import-x rule list beyond the README summary.
