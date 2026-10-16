---
name: guards-rust
description: "Use when setting up, repairing, or proving guardrails in a Rust or Cargo project (a crate or workspace): cargo fmt, clippy lints with warnings as errors, cargo test, rust-toolchain.toml or MSRV pins, cargo-deny, a pre-commit hook, or CI, including a Rust repo with no CI, no pre-commit hook, or existing clippy warnings."
---

# Guards (Rust)

Guardrails for a Cargo project: format, lint, and test, run by a pre-commit hook on every commit and by CI on every push, each one **proven to bite**. Load the `gates` skill with your skill tool: it holds the procedure (inventory, matching, one command per check, the red baseline, hook, CI, proof, record, report); this skill supplies the Rust commands, keyed to its steps.

The checks, cheapest first:

| Check | Command | Catches |
|---|---|---|
| Format | `cargo fmt --all --check` | anything rustfmt would change; exits 1 |
| Lint | `cargo clippy --workspace --all-targets --all-features -- -D warnings` | rustc and clippy warnings, as errors, in every target (tests, examples, benches too) |
| Test | `cargo test --workspace --all-features --locked` | unit, integration, and doc tests; a stale `Cargo.lock` |

Config details, the ratchet, nextest, supply-chain tools, hook managers, and CI actions: [TOOLS.md](TOOLS.md). Where each fact was checked: [SOURCES.md](SOURCES.md). These tools change every six weeks; when a flag, key, or action version matters, check its source page or `--help` rather than memory.

## Inventory sources

- **Workspace**: the root `Cargo.toml` (`[workspace]` `members`, `exclude`, `default-members`, `resolver`; `[workspace.package]` `edition` and `rust-version`; `[workspace.lints]`), and in each member its `[lints]` table (`workspace = true`, its own levels, or none) and `[features]`.
- **Toolchain**: `rust-toolchain.toml` or `rust-toolchain` (channel, components), and `rust-version` (the MSRV).
- **Config**: `rustfmt.toml` / `.rustfmt.toml`, `clippy.toml` / `.clippy.toml`, `.cargo/config.toml` (`[alias]`, `[build] rustflags`, `build.warnings`).
- **Suppressions already in the code**: count `#![allow(`, `#[allow(`, `#[expect(`, and `"allow"` levels in `[lints]`.
- **Tests**: `.config/nextest.toml` or `cargo nextest` in scripts or CI; whether the crates have doc tests.
- **Supply chain**: `deny.toml` (cargo-deny), `audit.toml` or `.cargo/audit.toml` (cargo-audit).
- **Hooks**: `.pre-commit-config.yaml`, a lefthook config (`lefthook.yml` and its variants), `core.hooksPath`, `.git/hooks/`, a `.cargo-husky/` folder.
- **CI and entry points**: `.github/workflows/`, other CI files, `justfile`, `Makefile`, an `xtask` crate, README, CONTRIBUTING.
- **Current state**: which files fmt would change, the clippy findings **by lint name with counts** (the counting command is in TOOLS.md), and which tests fail.

Matching, in Rust: a `justfile` recipe or `xtask` stays the entry point and gains the checks; a `deny.toml` or `audit.toml` that nothing runs gets a CI step (TOOLS.md).

## One command per check

- **Lint levels** live in `[workspace.lints]` in the root `Cargo.toml`, and every member opts in with `[lints] workspace = true`. A member without that line inherits nothing, and one with it can't add its own lint keys (Cargo refuses the manifest). Keep levels the project already chose.
- **Warnings become errors at the command**, with `-- -D warnings` on the clippy line: it works on every toolchain and only affects this workspace's crates. (The `CARGO_BUILD_WARNINGS` alternative and its version limit: TOOLS.md.)
- **Toolchain**: pin the channel in `rust-toolchain.toml` with the `rustfmt` and `clippy` components, so a new stable release's lints arrive as a deliberate upgrade instead of a red build. If the project tracks `stable` on purpose, keep it and note the risk in the report. Keep `rust-version` as the project set it; checking it in CI is in TOOLS.md.

## Red on existing code

Follow `gates` step 4 (measure, show the count, ask). In Rust:

- **Formatting**: the fix is `cargo fmt --all` in its own commit, with no other change in it. Show the user the file count first if it's large.
- **Tests**: stop and show the user; a failing test is a bug to diagnose, not a guardrail setting.
- **Clippy or rustc warnings**, when the user picks the **ratchet**:
  1. List every lint that fires, with its count, from the baseline.
  2. Put each one on the ratchet list as `--force-warn <lint>` after `-D warnings`. A forced lint still prints every hit but can't be raised to an error; every other warning fails the gate, so no new kind of warning gets in.
  3. Put the whole command in a Cargo alias (`cargo lint`, template in TOOLS.md), so the hook, CI, and people run one line and the list lives in one place.
  4. Give the user the list with counts, and say what it costs: a forced lint lets new hits of that same lint in too, so offer to fix the small entries first. When a lint's last hit is fixed, its entry is deleted. `cargo clippy --fix` handles many warnings mechanically, as its own commit, if the user asks for fixes.

Getting green with `#[allow(...)]`, `#![allow(...)]`, `#[expect(...)]`, an `"allow"` level in `[lints]`, or an `-A` flag is a new suppression, which the constraint floor forbids. To make the suppressions already there visible, offer (as a separate decision, with the count it would flag) `allow_attributes_without_reason = "deny"` and `allow_attributes = "deny"` in `[workspace.lints.clippy]`: the second turns each outer `#[allow]` into an `#[expect]`, which warns (`unfulfilled_lint_expectations`) once the lint stops firing. Neither checks inner `#![allow]` attributes for being stale.

Done when each command exits 0 on the current tree (with the ratchet, if there is one), and the ratchet list with counts is written down.

## Pre-commit hook

Format and the lint command (seconds on a warm build cache). If clippy takes more than about ten seconds on this workspace, run it on `pre-push` instead. Hook-manager entries (pre-commit framework, lefthook) are in TOOLS.md. cargo-husky and rusty-hook haven't been released since 2020; don't add them.

Plain hook (`.githooks/pre-commit`, LF line endings, executable):

```sh
#!/bin/sh
set -e
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings   # or: cargo lint, with a ratchet
```

## CI

For GitHub Actions with no CI present:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v<current>
      - run: rustup toolchain install   # no argument: installs what rust-toolchain.toml names, with its components
      - uses: Swatinem/rust-cache@v<current>
      - run: cargo fmt --all --check
      - run: cargo clippy --workspace --all-targets --all-features -- -D warnings   # or: cargo lint
      - run: cargo test --workspace --all-features --locked
```

- Action versions: each README, linked in SOURCES.md; the official docs disagree with each other, so don't copy a version from one page.
- Without a toolchain file, the hosted runners' stable Rust already includes clippy and rustfmt; on a self-hosted runner add `rustup component add clippy rustfmt` before the checks.
- With nextest, add a separate doc test step (`cargo test --workspace --doc`): nextest doesn't run doc tests.
- Toolchain actions that set warning or flag variables for you, and supply-chain steps: TOOLS.md.
- The job name to make a required status check is `check`.

## Violations to plant

For `gates` step 7:

| Gate | A violation to plant |
|---|---|
| Format | append `pub fn g( ) -> u8 {1}` to a source file |
| Lint, clippy | `pub fn h(v: &Vec<u8>) -> usize { v.len() }` (`clippy::ptr_arg`), or any lint not on the ratchet list |
| Lint, rustc | `let unused = 1;` inside a function (`unused_variables`); if that lint is on the ratchet list, `let mut x = 1; x` (`unused_mut`) |
| Test | flip one expected value in an existing unit test |
| Doc test | flip the expected value in a `///` example: this catches a test command that skips doc tests (`--all-targets`, nextest) |
| Pre-commit hook | stage the format plant and run `git commit`; the commit must be refused |
| CI | push a plant on a throwaway branch or draft pull request and watch its step go red; delete the branch after |
| Supply chain, if present | temporarily add a `deny` entry for a crate already in the tree to `deny.toml`; `cargo deny check bans` must fail |

Why a gate stayed green, in Rust: a `CARGO_BUILD_WARNINGS` the toolchain ignores, a member without `[lints] workspace = true`, a test command that skips doc tests, `core.hooksPath` not set in this clone, extra flags after `cargo lint` landing on clippy, `continue-on-error` on the step.

## Record

Beyond `gates` step 8: format and lint run on every edit, tests at task end and in CI. In Rust the floor's "suppression" is whatever the `audit` skill's floor guard (`scripts/floor-guard.mjs`) flags: `allow` and `expect` attributes (also under `cfg_attr`), an `"allow"` level in `[lints]`, `-A` or `--allow` flags, `--cap-lints`, RUSTSEC ignores, `[bans]` `skip` entries, and a new entry on the ratchet list after the initial one. The instruction-file line names format, the lint command or `cargo lint`, and the test command. The report carries the ratchet list with counts.
