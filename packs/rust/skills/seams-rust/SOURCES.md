# Sources

Checked 2026-09-27, when stable Rust was 1.98.1. Versions current then: cargo-modules 0.27.0, cargo-deny 0.20.2, cargo_metadata 0.23.1 (crates.io). Each line names what the skill takes from the page; re-check a page before relying on a detail that may have moved.

## Cargo and the language (doc.rust-lang.org)

- `cargo metadata`: https://doc.rust-lang.org/cargo/commands/cargo-metadata.html — `--format-version 1`; `--no-deps` (members only, `resolve` null); `packages[].dependencies[]` `name`, `kind` (`null`, `"dev"`, `"build"`), `path`, `rename`; `targets[]`; `workspace_members`, `workspace_root`.
- `cargo tree`: https://doc.rust-lang.org/cargo/commands/cargo-tree.html — `--workspace`; `--depth workspace` (only member dependencies); `-e` / `--edges` (`normal`, `build`, `dev`, `no-dev`, ...); `-i` / `--invert`, with `cargo tree -i <crate> --workspace` as the example; `--prefix depth`.
- Workspaces: https://doc.rust-lang.org/cargo/reference/workspaces.html — members, path dependencies, `[workspace.lints]`.
- `[lints]`: https://doc.rust-lang.org/cargo/reference/manifest.html#the-lints-section — tables by tool, levels, `priority`.
- Environment variables: https://doc.rust-lang.org/cargo/reference/environment-variables.html — `CARGO_MANIFEST_DIR` at compile time (`env!`), also set for `cargo test` runs.
- Visibility and privacy: https://doc.rust-lang.org/reference/visibility-and-privacy.html — the two privacy rules; `pub(crate)`, `pub(self)`, `pub(super)`, `pub(in path)` (an ancestor, starting with `crate`, `self`, or `super`); `pub use` re-exports make an item reachable by the shorter path only.
- `unreachable_pub`: https://doc.rust-lang.org/rustc/lints/listing/allowed-by-default.html#unreachable-pub — allow by default; suggests `pub(crate)`.
- Documentation tests: https://doc.rust-lang.org/rustdoc/write-documentation/documentation-tests.html — `compile_fail`: the test fails if the code compiles; code that fails today may compile in a later release.

## Tools

- cargo-modules: https://github.com/regexident/cargo-modules — `structure`, `dependencies` (`--lib`, `-p`, `--no-externs`, `--no-sysroot`, `--no-fns`, `--no-types`, `--no-traits`, `--no-uses`, `--acyclic`, `--layout`, `--focus-on`, `--max-depth`, `--cfg-test`), `orphans --deny`; installed with `cargo install cargo-modules`.
- cargo-deny bans: https://embarkstudios.github.io/cargo-deny/checks/bans/cfg.html — `deny` entries with `crate`, `wrappers` (only these may depend on it directly), `reason`, `use-instead`; `allow-workspace`.
- cargo-deny `check`: https://embarkstudios.github.io/cargo-deny/cli/check.html — `cargo deny check [advisories|bans|licenses|sources]`, the exit-code bitset (bans = 2), `cargo deny init`.
- cargo-deny-action: https://github.com/EmbarkStudios/cargo-deny-action — `@v2`, `command: check bans ...`.
- Clippy configuration: https://doc.rust-lang.org/clippy/configuration.html — `clippy.toml` / `.clippy.toml` lookup: `CLIPPY_CONF_DIR`, then `CARGO_MANIFEST_DIR`, then the current directory, then each parent until one is found.
- `disallowed_types`, `disallowed_methods`, `redundant_pub_crate`, `pub_use`: `cargo clippy --explain <lint>` (Clippy 0.1.96), with the lint index at https://rust-lang.github.io/rust-clippy/stable/index.html — `disallowed-*` entries as strings or `{ path, reason, replacement, allow-invalid }`, warn by default and active only when configured. Groups found by enabling each group on a scratch crate: `redundant_pub_crate` is nursery, `pub_use` restriction.
- cargo_metadata: https://docs.rs/cargo_metadata/latest/cargo_metadata/ — `MetadataCommand::new()`, `.manifest_path()`, `.no_deps()`, `.exec()`; `Metadata::workspace_packages()`; `Package.dependencies`, `Dependency.name`.

## Checked by running

With Rust 1.96.0 (cargo 1.96.0, clippy 0.1.96, cargo-deny 0.20.2, cargo-modules 0.27.0, cargo_metadata 0.23.1) on scratch crates:

- `pub mod tax;` changed to `mod tax;` with `pub use tax::rate;`: each outside path through `tax` failed with ``error[E0603]: module `tax` is private``, in a `use` and in a function body, with file and line. The visibility example in TOOLS.md compiled clean under `-D warnings` with `unreachable_pub = "warn"`; a `pub fn` in a private module then failed with "unreachable `pub` item".
- A member using a crate it doesn't list (reached through another member) failed with E0433.
- A normal dependency cycle between members failed with "cyclic package dependency"; a dev-dependency cycle built.
- `cargo tree --workspace --depth workspace` and `cargo tree -i ledger --workspace --prefix depth` printed only member edges.
- `[bans] deny = [{ crate = "ledger", wrappers = ["billing"] }]`: a direct normal or dev-dependency on `ledger` from another member failed `cargo deny check bans` (exit 2, `error[banned]` after `warning[unmatched-wrapper]`); reaching it through `billing` passed.
- A root `clippy.toml` with `disallowed-types` flagged its type; adding `crates/app/clippy.toml` with only `disallowed-methods` flagged the method and no longer the type.
- A `compile_fail` doc test naming `vis2::billing::tax::rate` passed while `tax` was private and failed ("Test compiled successfully, but it's marked `compile_fail`") once it was `pub mod tax`; written as `compile_fail,E0999`, it still passed on stable.
- The `cargo_metadata` architecture test in TOOLS.md passed, failed naming the offender when the forbidden dependency was planted, and passed after the revert.
- cargo-modules 0.27.0: `dependencies` showed `uses` edges for `use` declarations and signatures but not for `crate::billing::tax::rate(0)` inside a function body; `--acyclic` passed on two modules that use each other's items; `--layout none` printed nothing.
- `scripts/edges.py --selftest` plants a module cycle, deep reaches by `use`, by a path in a function body, and through a module alias, a cross-crate reach past a re-export, a dev-dependency crate cycle, a `mod` with no file, and a comment and a string that name the deep path, and checks that each is reported (or ignored) as it should be, that a clean crate reports nothing, and that a bad manifest or flag exits 2. Mutating the lexer, the alias resolution, the test-module filter, or the cycle finder each made it fail. On regex-syntax, clap_builder, rayon, and serde_json it ran in under a second each; its E0603 reach list matched the compiler probe on the scratch crate.

## Not verified

- Paths made by macros and names reached through glob imports: the script can't see them by design, which is why step 2 confirms a boundary with the compiler probe.
- `#[path]` attributes inside inline modules: the script resolves `#[path]` relative to the declaring file only.
