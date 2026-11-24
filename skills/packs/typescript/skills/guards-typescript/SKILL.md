---
name: guards-typescript
description: Use when a TypeScript or Node project (package.json, tsconfig) needs guardrails or has none, when wiring tsc strict type checks, ESLint, Prettier, or tests into a pre-commit hook or CI workflow, or when those checks are missing or don't block a merge.
---

# Guards (TypeScript)

The guardrails for a TypeScript or Node project: the typecheck, lint, format, and test commands, run in a pre-commit hook and in CI, each one **proven to bite**. Load the `gates` skill with your skill tool: it holds the procedure (inventory, matching, one command per check, the red baseline, hook, CI, proof, record, report); this skill supplies the TypeScript commands, keyed to its steps.

Commands, config keys, and action versions: [TOOLS.md](TOOLS.md). Where each fact was checked: [SOURCES.md](SOURCES.md). These tools change often; when a flag or version matters, check the source page before relying on it.

## Inventory sources

| Dimension | Look at | Record |
|---|---|---|
| Package manager | lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`/`bun.lockb`) and `packageManager` in `package.json` | the one manager every command uses |
| Node version | `engines`, `.nvmrc`, `.node-version`, `devEngines`, `.tool-versions` | the file CI reads the version from |
| Workspaces | `workspaces` in `package.json`, `pnpm-workspace.yaml` | root-only or per-package checks |
| Typecheck | `tsconfig*.json` (`strict`, `references`), a `typecheck` script | the command, or missing |
| Lint | `eslint.config.*`, `.eslintrc*` (unsupported since ESLint 10), `biome.json`, other linters in scripts | the tool and command, or missing |
| Format | `.prettierrc*`, `biome.json`, a `fmt`/`format` script | the tool and its **check** (non-writing) command, or missing |
| Tests | `vitest`, `jest`, `node --test`, `mocha` in scripts and devDependencies | the single-run command, or missing |
| Hooks | `.husky/`, `lefthook.yml`, `simple-git-hooks` in `package.json`, `git config core.hooksPath` | the hook manager, or missing |
| CI | `.github/workflows/*.yml`, other CI files | which checks run on pull requests, or missing |

Matching, in TypeScript: a repo with `biome.json` gets Biome for lint and format, not ESLint plus Prettier; a pnpm lockfile means pnpm in every script, hook, and workflow. For a missing row, pick the default in [TOOLS.md](TOOLS.md).

## One script per check

Put each check in `package.json` `scripts` so hooks, CI, and agents all run the same command: `typecheck`, `lint`, `format:check` (or the one lint-and-format command the project's tool offers), `test` as a **single run** (watch mode never exits), and `check` running all of them. Keep the project's existing script names; add the missing ones beside them.

**Red on existing code**: follow `gates` step 4 (measure, show the count, ask); never add suppression comments or loosen the config to get green. The TypeScript ratchet: turn on as errors the lint rules that are already clean, and list each remaining rule with its count as a ratchet entry (boundary rules use dependency-cruiser's baseline, in `seams-typescript`).

Strictness: `strict: true` is the floor. Stricter flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and type-aware lint configs surface many errors in existing code: offer them as a separate decision with the error count, after the gates are green.

Done when every script exits 0 on the current tree (or the user has decided about the violations), and `check` runs them all.

## Pre-commit hook

Format and lint only the **staged** files (lint-staged, or the hook manager's staged-files filter), plus the whole-project typecheck (tsc checks a project, not single files). Install the hook through the manager's `prepare`-script step, so a fresh clone gets it on install. The hook can be skipped (`--no-verify`, `HUSKY=0`). Hook managers: [TOOLS.md](TOOLS.md).

## CI

A GitHub Actions workflow (template in [TOOLS.md](TOOLS.md)): check out, set up the package manager and Node from the file the repo already uses, install **from the lockfile without changing it** (the command per manager is in TOOLS.md), then each check as its own named step. Making it required can be done by an admin by hand or with `gh api`; TOOLS.md names the job and why the gate job stays unconditional.

## Violations to plant

For `gates` step 7, at both gates:

| Check | Plant |
|---|---|
| Typecheck | `const n: number = "x";` in a source file |
| Lint | a rule violation the config enables (an unused variable; `no-floating-promises` if type-aware) |
| Format | break the formatting of one line |
| Test | flip one expected value in an existing test |

For CI, also see the merge blocked before deleting the throwaway branch.

Why a check stayed green, in TypeScript: a wrong glob, a warning that doesn't fail the run (`--max-warnings 0` missing), a watch-mode test script, a step with `continue-on-error`.

## Record

Per `gates` step 8, for example "Types | zero errors | `pnpm typecheck` | every edit, CI". The instruction-file line names the `check` script. The report also lists the hand steps left beyond the required check, such as secrets.
