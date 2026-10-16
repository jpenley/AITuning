# Sources

Checked 2026-09-27, when stable Rust was 1.98.1 (https://blog.rust-lang.org/releases/). Each line names what the skill takes from the page. Re-check a page before relying on a detail that may have moved.

## Cargo (doc.rust-lang.org/cargo)

- `[lints]`: https://doc.rust-lang.org/cargo/reference/manifest.html#the-lints-section — levels `forbid`, `deny`, `warn`, `allow`; `priority` (lower is overridden by higher); the table is the part of the lint name before `::`; applies only to the current package, not dependencies; respected from 1.74.
- Workspaces: https://doc.rust-lang.org/cargo/reference/workspaces.html — `[workspace.lints]` with `[lints] workspace = true`; `[workspace.package]` keys including `rust-version` and `edition`, inherited with `key.workspace = true`; `members`, `exclude`, `default-members`; `resolver` must be set in a virtual workspace.
- `rust-version`: https://doc.rust-lang.org/cargo/reference/rust-version.html — Cargo errors on an older toolchain; `--ignore-rust-version`; cargo-hack and cargo-msrv for checking it.
- Resolver: https://doc.rust-lang.org/cargo/reference/resolver.html — resolver `"3"` is the edition 2024 default (Rust 1.84+) and changes `incompatible-rust-versions` to `fallback`, preferring dependencies whose `rust-version` fits.
- Configuration: https://doc.rust-lang.org/cargo/reference/config.html — `build.warnings` (`warn`, `allow`, `deny`; env `CARGO_BUILD_WARNINGS`; respected as of 1.97); `build.rustflags` / `RUSTFLAGS`; `resolver.incompatible-rust-versions`; `[alias]`.
- Continuous integration guide: https://doc.rust-lang.org/cargo/guide/continuous-integration.html — the `cargo hack check --rust-version --workspace --all-targets --ignore-private` MSRV job with `taiki-e/install-action@cargo-hack`; the warnings job with `CARGO_BUILD_WARNINGS: deny` and `cargo clippy --all-targets --all-features --keep-going`; pin the toolchain because new releases add warnings. Its examples showed `actions/checkout@v6`.
- `cargo test`: https://doc.rust-lang.org/cargo/commands/cargo-test.html — default targets include doc tests; `--all-targets` is `--lib --bins --tests --benches --examples` and excludes doc tests; `--doc`; `--workspace`; `--locked` fails on a missing or changing `Cargo.lock`.

## Lints (rustc and Clippy)

- Lint levels: https://doc.rust-lang.org/rustc/lints/levels.html — `allow`, `expect`, `warn`, `force-warn`, `deny`, `forbid`; `force-warn` can't be overridden, even under `--cap-lints`; later flags win, but `force-warn` and `forbid` can't be overridden; source attributes beat CLI levels except `-F`; the `warnings` group applies to every lint that would warn; `reason =` on lint attributes; `expect` fires `unfulfilled_lint_expectations` when unused.
- Lint groups: https://doc.rust-lang.org/rustc/lints/groups.html — `warnings` is "all lints that are set to issue warnings"; the other group names.
- Clippy usage: https://doc.rust-lang.org/clippy/usage.html — `cargo clippy -- -Dwarnings` also fails on rustc warnings; `-A/-W/-D clippy::<lint>`; `-p`; `--fix` implies `--all-targets`.
- Clippy on GitHub Actions: https://doc.rust-lang.org/clippy/continuous_integration/github_actions.html — hosted runners with stable Rust have Clippy; `RUSTFLAGS: "-Dwarnings"`; `cargo clippy --all-targets --all-features`; `actions/checkout@v7`.
- Clippy configuration: https://doc.rust-lang.org/clippy/configuration.html — `clippy.toml` / `.clippy.toml` lookup (`CLIPPY_CONF_DIR`, then `CARGO_MANIFEST_DIR`, then upward); `[lints.clippy]` in `Cargo.toml`; `msrv`.
- Clippy lint groups: https://github.com/rust-lang/rust-clippy/blob/master/README.md — `clippy::all` is correctness (deny), suspicious, style, complexity, perf (warn); pedantic, restriction, nursery, cargo are allow.
- `allow_attributes`, `allow_attributes_without_reason`: `cargo clippy --explain <lint>` (Clippy 0.1.96) — `allow_attributes` flags outer `#[allow]` only, not `#![allow]`, and suggests `#[expect]`; both are `restriction` lints (found by enabling `-W clippy::restriction` on a scratch crate). Lint index: https://rust-lang.github.io/rust-clippy/stable/index.html

## rustfmt and rustup

- rustfmt: https://github.com/rust-lang/rustfmt — `--check` exits 0 with no changes and 1 with changes; `rustfmt.toml` or `.rustfmt.toml` in the project or a parent; unstable options need nightly; `cargo fmt` reads the edition from `Cargo.toml`; `style_edition` inferred from the edition.
- Toolchain file: https://rust-lang.github.io/rustup/overrides.html — `rust-toolchain.toml` keys `channel`, `path`, `components`, `targets`, `profile`; precedence (`+toolchain`, `RUSTUP_TOOLCHAIN`, directory override, toolchain file, default).
- rustup changelog: https://github.com/rust-lang/rustup/blob/main/CHANGELOG.md — 1.28.0 stopped auto-installing and advised `rustup toolchain install` with no arguments; 1.28.1 restored auto-install by default, opt-out `RUSTUP_AUTO_INSTALL=0`; `rustup set auto-install disable` (1.28.2).

## Tests and supply chain

- nextest, running tests: https://nexte.st/docs/running/ — `cargo nextest run`, `--workspace`, `--profile ci`, `--no-tests` (default `fail` since 0.9.85), `.config/nextest.toml`; doc tests unsupported, run `cargo test --doc`.
- cargo-hack: https://github.com/taiki-e/cargo-hack — `--each-feature`, `--feature-powerset`, `--rust-version`, `--ignore-private`, `--workspace`.
- cargo-deny `check`: https://embarkstudios.github.io/cargo-deny/cli/check.html — the four checks, the exit-code bitset, `cargo deny init`.
- cargo-deny bans: https://embarkstudios.github.io/cargo-deny/checks/bans/cfg.html — `deny` entries with `wrappers`, `reason`, `use-instead`; `skip`; `allow` denies everything else.
- cargo-deny-action: https://github.com/EmbarkStudios/cargo-deny-action — `@v2`; inputs `command`, `arguments`, `rust-version` (bundled Rust 1.85.0 on the check date), `manifest-path`; the recommended pipeline runs `advisories` as its own matrix entry with `continue-on-error` "to avoid sudden breakages".
- cargo-audit: https://github.com/rustsec/rustsec/tree/main/cargo-audit — `cargo audit`, `--ignore`, `audit.toml`; `rustsec/audit-check`: https://github.com/rustsec/audit-check (`@v2.0.0` in its README, `token`, issue and check permissions).

## Hooks and CI

- Git hooks: https://git-scm.com/docs/githooks — `core.hooksPath`; a non-zero exit from `pre-commit` aborts the commit; `--no-verify` bypasses it.
- cargo-husky (1.5.0, 2020-01-21) and rusty-hook (0.11.2, 2020-06-23): their crates.io pages, https://crates.io/crates/cargo-husky and https://crates.io/crates/rusty-hook — last releases.
- pre-commit `language: unsupported` (renamed from `system` in 4.4.0): https://pre-commit.com/ ; the `rust` file type for `.rs`: https://github.com/pre-commit/identify/blob/main/identify/extensions.py
- lefthook: https://github.com/evilmartians/lefthook (README: `pre-commit:` `jobs:` with `run` and `glob`) and its configuration docs (config file names including `.lefthook.yml`, `.config/lefthook.yml`, TOML and JSON variants): https://github.com/evilmartians/lefthook/blob/master/docs/configuration.md
- `actions/checkout`: https://github.com/actions/checkout — README showed `@v7`.
- `Swatinem/rust-cache`: https://github.com/Swatinem/rust-cache — `@v2`; set up the toolchain first, the cache key uses the rustc version.
- `actions-rust-lang/setup-rust-toolchain`: https://github.com/actions-rust-lang/setup-rust-toolchain — `@v2`; reads `rust-toolchain` / `rust-toolchain.toml` when no `toolchain` input; `build-warnings` defaults to `deny` (sets `CARGO_BUILD_WARNINGS`); caching via rust-cache on by default; problem matchers.
- `dtolnay/rust-toolchain`: https://github.com/dtolnay/rust-toolchain — the ref names the toolchain (`@stable`, `@1.89.0`), or `@master` with a `toolchain` input; `components`, `targets`; its `action.yml` runs `rustup default <toolchain>`.
- `taiki-e/install-action`: https://github.com/taiki-e/install-action and its TOOLS.md — `@v2` with `tool:`, or `@<tool>`; cargo-hack, cargo-nextest (alias `nextest`), cargo-deny, cargo-audit are supported.
- Required status checks: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

## Checked by running

On a scratch three-crate workspace with Rust 1.96.0 (cargo 1.96.0, clippy 0.1.96, rustfmt 1.9.0, cargo-deny 0.20.2, rustup 1.29.0):

- `-D warnings` plus `--force-warn clippy::needless_return` (and `--force-warn unused_variables`) left those lints as warnings, exit 0; a planted `clippy::ptr_arg` then failed, exit 101. The same flags in a `.cargo/config.toml` alias behaved the same; `cargo lint --locked` failed with "Unrecognized option: 'locked'" (the flag went to clippy). With `unused_variables` also forced, a planted `let mut x = 1; x` still failed (`unused_mut`).
- `[workspace.lints.clippy] all = { level = "deny", priority = -1 }` with one lint at `"warn"` made that lint a warning, and `-D warnings` then made it an error. `[workspace.lints.rust] warnings = "deny"` was accepted and turned the clippy warning into an error.
- `[lints] workspace = true` beside a `[lints.clippy]` table: "cannot override `workspace.lints` in `lints`".
- `CARGO_BUILD_WARNINGS=deny cargo check` on 1.96 printed an unused-variable warning and exited 0.
- `cargo fmt --all --check` exited 1 on a planted line and 0 after the restore; in a virtual workspace, `cargo fmt --check` without `--all` also covered the members. A `rustfmt.toml` with `imports_granularity` on stable warned and exited 0.
- A broken doc test: `cargo test --workspace --all-targets` exit 0; `cargo test --workspace` and `cargo test --workspace --doc` exit 101.
- A `.githooks/pre-commit` with `core.hooksPath` refused commits with a format plant and with a clippy plant, and let the clean tree commit (the ratchet lint printed as a warning).
- The jq counting command listed each lint once per file and line.
- `rustup toolchain install` with no argument, in a scratch `RUSTUP_HOME`, installed the channel the toolchain file named with its `minimal` profile plus `rustfmt` and `clippy`.

## Not verified

- `build.warnings` on Cargo 1.97+ (the installed toolchain was 1.96): the proof step settles it per repo.
- The GitHub Actions workflow itself was not run; its steps were run locally in order.
