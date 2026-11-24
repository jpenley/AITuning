# Tools for TypeScript/Node module boundaries

Checked against the official docs in [SOURCES.md](SOURCES.md) on 2026-09-27; re-check a page before relying on a flag that matters. Examples use a pnpm workspace with `packages/*` and `apps/*`; substitute the repo's folders and package manager.

## dependency-cruiser (default)

Install as a devDependency (`dependency-cruiser`); the binaries are `depcruise` and `dependency-cruiser`. `npx depcruise --init` asks a few questions and writes `.dependency-cruiser.js` (`.cjs`, `.mjs`, `.ts`, `.json` also work) with starter rules including `no-circular`, `no-orphans`, and `not-to-unresolvable`. The config is picked up by default; `--config <file>` is only for another name, and `--config src` would read `src` as the rules file.

Options that decide whether the graph is complete:

```js
options: {
  doNotFollow: { path: "node_modules" },
  tsPreCompilationDeps: true,               // keep type-only imports in the graph
  tsConfig: { fileName: "tsconfig.json" },  // resolve `paths` aliases (reads compilerOptions only)
  enhancedResolveOptions: {
    exportsFields: ["exports"],             // honour package.json exports
    conditionNames: ["import", "require", "node", "default"],
  },
},
```

Symlinked workspace packages are resolved to their real path by default (`preserveSymlinks: false`), so `@acme/billing` lands on `packages/billing/...`.

### Commands

| Need | Command |
|---|---|
| Check the rules (CI) | `npx depcruise packages apps --output-type err` (exit code = number of `error`-severity violations) |
| Package graph | the command below (mermaid; `--output-type dot` piped to Graphviz also works) |
| Fan-in / fan-out | `npx depcruise packages apps --output-type metrics`: per module and folder, Ca (coming in), Ce (going out), instability I = Ce / (Ca + Ce) |
| One module's neighbours | `--focus "^packages/billing/"`; what transitively depends on a file: `--reaches "<regex>"` |
| Baseline known violations | `npx depcruise packages apps --baseline` (writes `.dependency-cruiser-known-violations.json`), then check with `--ignore-known` |

The package graph, collapsed to one node per package (a code block because the regex alternation cannot sit in a table cell):

```sh
npx depcruise packages apps --include-only "^(packages|apps)/" --collapse "^(packages|apps)/[^/]+" --output-type mermaid
```

### Rules

In `forbidden`, each with `severity: "error"` (the default is `warn`, which doesn't fail the exit code):

```js
forbidden: [
  { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  { name: "not-to-unresolvable", severity: "error", from: {}, to: { couldNotResolve: true } },
  {
    name: "no-deep-imports",
    comment: "Outside a package, import it only through its entry point",
    severity: "error",
    from: { path: "^(?:packages|apps)/([^/]+)/" },
    to: {
      path: "^packages/[^/]+/src/",
      pathNot: ["^packages/$1/", "^packages/[^/]+/src/index\\.ts$"],
    },
  },
  {
    name: "billing-not-to-orders",
    comment: "billing is upstream of orders",
    severity: "error",
    from: { path: "^packages/billing/" },
    to: { path: "^packages/orders/" },
  },
],
```

- `$1` in `to` refers to the group captured by `from.path` (the docs' "group matching"), so a package's own files are exempt from its deep-import rule.
- `to.circular` accepts `via` / `viaOnly` to limit which cycles match, for example `viaOnly: { dependencyTypesNot: ["type-only"] }` to ignore cycles that exist only through types (a deliberate choice; the default counts them).
- `to.dependencyTypes` / `dependencyTypesNot` filter by edge kind (`local`, `npm`, `npm-dev`, `type-only`, `dynamic-import`, ...); `reachable: false` expresses "must never reach".

## madge (quick cycle check)

`npx madge --circular --extensions ts,tsx --ts-config tsconfig.json packages` exits 1 when it finds a cycle. `--json` prints each module's dependencies (count them for fan-out), `--depends <module>` lists its importers (fan-in), `--orphans` lists unimported files, `--image graph.svg` needs Graphviz. `detectiveOptions.ts.skipTypeImports: true` drops type-only imports. It has no rules for direction or deep imports: use it to measure, not to enforce.

## ESLint rules

Use these when the repo prefers every rule in lint.

- **Deep imports by specifier** (core, cheap): `no-restricted-imports` with `patterns: [{ group: ["@acme/*/src/*"], message: "Import @acme/<pkg> through its entry point" }]` (gitignore-style `group`, or `regex`). It matches the import text, so it misses relative imports across package folders: pair it with an `exports` map or a path-based rule.
- **Path zones**: eslint-plugin-import's `import/no-restricted-paths` (`zones: [{ target, from, except }]`) and `import/no-internal-modules` (`allow` / `forbid` globs). eslint-plugin-import-x is the maintained, faster fork with flat configs (`importX.flatConfigs.recommended`, `importX.flatConfigs.typescript`) and `exports` support; its rules use the `import-x/` prefix.
- **Cycles**: `import/no-cycle` or `import-x/no-cycle`. Its docs warn it is computationally expensive, and it skips type-only imports; in a large repo, dependency-cruiser in CI is usually faster.
- **eslint-plugin-boundaries** (v7): declare elements in `settings["boundaries/elements"]` (`{ type, pattern }`), then allow or disallow edges with `boundaries/dependencies` (`rules: [{ from, allow | disallow }]`). `element-types`, `entry-point`, and `no-private` are deprecated in v7; entry points are expressed with the `fileInternalPath` selector in `boundaries/dependencies`.

## Monorepo tools (when the repo already uses them)

- **Nx**: tag projects (`"tags": ["scope:billing"]` in `project.json`, or `"nx": { "tags": [...] }` in `package.json`) and constrain them with the `@nx/enforce-module-boundaries` ESLint rule's `depConstraints` (`sourceTag`, `onlyDependOnLibsWithTags`). It also reports cycles between projects and deep imports by relative path. `nx graph` shows the project graph (`--file=graph.json` exports it).
- **Turborepo**: `turbo boundaries` flags imports outside a package's folder and imports of undeclared dependencies; tag rules go under `boundaries.tags` in `turbo.json`. The feature is marked experimental.

## The interface: `exports` and TypeScript resolution

```json
{
  "name": "@acme/billing",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
    "./internal/*": null
  }
}
```

- With `exports`, every unlisted subpath is encapsulated: importing it throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. `*` patterns expose subpaths; `null` excludes them. Condition order matters (first match wins); `types` goes first.
- TypeScript follows `exports` when `moduleResolution` is `node16`, `nodenext`, or `bundler` (`resolvePackageJsonExports` defaults on for those); `node10` ignores it.
## TypeScript project references

`"references": [{ "path": "../billing" }]` with `"composite": true` in each referenced project; build with `tsc -b`. Imports from a referenced project resolve to its built `.d.ts` output. A `composite` project must list all its implementation files (`include` or `files`) and keeps them under `rootDir`, so reaching into another project's source by relative path fails the build (TS6307 "not listed within the file list of project", or TS6059 "not under 'rootDir'"). The handbook doesn't document a dedicated "missing reference" error: prove the direction you rely on with a plant.

## Unused code (after a boundary change)

Knip (`npx knip`) reports unused files, dependencies, and exports: useful once an `exports` map narrows a package's interface.
