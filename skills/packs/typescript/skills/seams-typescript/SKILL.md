---
name: seams-typescript
description: "Use when mapping or enforcing module boundaries in a TypeScript, JavaScript, or Node codebase or monorepo: stopping an app or package from importing another package's internals instead of its entry point (a package.json exports map or index.ts barrel), circular imports, the dependency graph, fan-in and fan-out, tsconfig paths aliases, or a dependency-cruiser or ESLint import rule between workspace packages."
---

# Seams (TypeScript)

The TypeScript tooling for module boundaries. Load the `gates` skill with your skill tool: its Part 2 holds the procedure (map, measure, decide, enforce, prove, document, report); this skill supplies the TypeScript commands. The terms are the `modules` skill's (**module**, **interface**, **seam**, **depth**). Commands and config: [TOOLS.md](TOOLS.md). Where each fact was checked: [SOURCES.md](SOURCES.md).

## What the terms are in TypeScript

- **Module**, at package scale: a workspace package (`packages/*`, `apps/*`). At folder scale: a folder with an `index.ts`.
- **Entry points**: the only files outside callers may import. For a package, its `package.json` `exports` map (or, with no `exports`, `main`/`types`, which blocks nothing). For a folder, its `index.ts` barrel.
- **Deep import**: an import that reaches past the entry points: `@acme/billing/src/internal/tax`, or `../../billing/src/internal/tax` across package folders.
- **Cycle**: modules that import each other, directly or through others. Count type-only imports too (`import type`): a type cycle is still coupling, even though it vanishes at runtime.
- **Fan-in**: how many modules import this one (afferent coupling, Ca). **Fan-out**: how many it imports (efferent coupling, Ce).

Boundaries leak through three doors, and a rule that watches one leaves the others open: tsconfig `paths` aliases that map a package name onto its `src/` (a match skips `exports`, and a wildcard alias such as `"@acme/billing/*": ["packages/billing/src/*"]` opens every file); relative imports across package folders; and packages with no `exports`, where every file is importable.

## Map the modules

List the packages (from `pnpm-workspace.yaml` or `workspaces` in `package.json`) and, for each one, its entry points (`exports`, else `main`), and the `paths` aliases in every `tsconfig*.json`. Existing boundary tooling: `.dependency-cruiser.*`, ESLint import or boundaries rules, Nx tags (`nx.json`, `project.json`), Turborepo `boundaries`, project `references`.

## Measure the edges

Default to dependency-cruiser (one tool for the graph, cycles, deep imports, and coupling metrics); use the repo's tool if it has one. Point it at the tsconfig so aliases resolve (an unresolved alias is an edge the tool silently can't see), and run its check for **unresolvable** imports: each one is a blind spot to fix in the config, or explain, before trusting the numbers. Cycles are listed as chains of files (`a.ts → b.ts → a.ts`) and at package level.

## Enforce it

The layers, strongest first; each rule goes in a command CI already runs (a `lint` or `check` script):

1. **The interface itself**: an `exports` map in the protected package's `package.json`, listing only its entry points. Node then refuses unlisted subpaths (`ERR_PACKAGE_PATH_NOT_EXPORTED`), and TypeScript does too under `moduleResolution` `node16`, `nodenext`, or `bundler`. Close the alias door with it: a `paths` alias skips `exports` entirely, so replace `paths` entries for workspace packages with real workspace dependencies (`"@acme/billing": "workspace:*"`), which TypeScript's docs recommend for monorepos; if an alias must stay, point it at the entry file only, never a wildcard into `src/`.
2. **A rule in the checks**: direction, deep imports, and cycles. Use the repo's existing tool (Nx `enforce-module-boundaries`, eslint-plugin-boundaries, ESLint `no-restricted-imports`); otherwise dependency-cruiser rules at `severity: "error"`. Rules for each tool: [TOOLS.md](TOOLS.md).
3. **Compile-time direction** (optional, larger change): TypeScript project `references`, so a package builds only against the packages it lists.

**Existing violations**: follow `gates`' red-baseline step (measure, show the count, ask). The TypeScript ratchet is dependency-cruiser's baseline (TOOLS.md): new violations fail while the known ones stay listed as work to burn down. Never widen the rule or exclude the offending files to get green.

## Violations to plant

Through the same command CI runs:

- a deep import through the **package name or alias** (`import { x } from "@acme/billing/src/internal/tax"`), not only a relative one: this catches the unresolved-alias false green;
- a new cycle (a file in one package importing from a package that already imports it);
- an import in the forbidden direction.

Why a rule stayed green, in TypeScript: an alias the tool can't resolve, or a rule pattern that matches no files; fix the resolution or the pattern.

## Document the boundary

Next to the code: the package's `README.md`, saying what is public, the allowed direction, and the command that checks it. The `CONSTRAINTS.md` row's command is the boundary script, for example `pnpm lint:deps`.
