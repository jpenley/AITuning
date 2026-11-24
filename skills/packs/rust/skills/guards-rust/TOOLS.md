# Tools for Rust guardrails

Defaults for a row the inventory found empty, and the facts that commonly trip a setup. Checked against the pages in [SOURCES.md](SOURCES.md) on 2026-09-27 (stable Rust was 1.98.1); re-check a page before relying on a detail that may have moved.

## Toolchain and MSRV

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.98.1"              # an exact release; "stable" tracks every new release
components = ["rustfmt", "clippy"]
profile = "minimal"
```

- rustup picks the toolchain in this order: `cargo +<toolchain>`, `RUSTUP_TOOLCHAIN`, a directory override, the toolchain file, the default. So a CI step that installs some other toolchain as the default doesn't change what `cargo` runs inside the repo.
- rustup installs a missing toolchain automatically on the first `cargo` call (the default since rustup 1.28.1; `RUSTUP_AUTO_INSTALL=0` turns it off). `rustup toolchain install` with no argument installs it explicitly, with the file's profile and components.
- `rust-version` (the MSRV) goes in `[package]`, or once in `[workspace.package]` with `rust-version.workspace = true` in each member. Cargo refuses to build the package on an older toolchain. The resolver `"3"` (the default for edition 2024) prefers dependency versions whose own `rust-version` fits. Clippy reads it too, so lints don't suggest newer APIs.
- To check the MSRV in CI (the Cargo book's recipe): `taiki-e/install-action@cargo-hack`, then `cargo hack check --rust-version --workspace --all-targets --ignore-private`.

## Lint levels

```toml
# root Cargo.toml
[workspace.lints.rust]
unsafe_code = "forbid"            # only if the project has decided this

[workspace.lints.clippy]
all = { level = "warn", priority = -1 }   # a group, below the single lints that override it
```

```toml
# each member's Cargo.toml
[lints]
workspace = true
```

- `[lints]` is respected from Cargo 1.74 and applies only to the package itself, never to dependencies.
- A group needs a lower `priority` than the single lints that override it; a lint's table is the part before `::` (`clippy::ptr_arg` goes under `[lints.clippy]`, `unused_variables` under `[lints.rust]`).
- A member with `workspace = true` can't also list its own lints: Cargo fails with "cannot override `workspace.lints` in `lints`".
- Clippy's groups: `clippy::all` is every default lint (correctness at deny; suspicious, style, complexity, perf at warn). `pedantic`, `nursery`, `restriction`, and `cargo` are off by default; offer `pedantic` only as a separate decision with its finding count, and never enable all of `restriction` (clippy warns on that itself: `blanket_clippy_restriction_lints`).
- `warnings = "deny"` under `[lints.rust]` is accepted, and turns every warn-level lint (clippy's too) into an error. It then can't be combined with a ratchet.

## Warnings as errors

| Where | Applies to | Watch for |
|---|---|---|
| `cargo clippy ... -- -D warnings` | this workspace's crates, in that run | nothing: works on every toolchain |
| `RUSTFLAGS="-Dwarnings"` (Clippy's GitHub Actions page) | every rustc call in the job | local runs without the variable differ from CI |
| `CARGO_BUILD_WARNINGS=deny` / `build.warnings = "deny"` (the Cargo book's CI page, with `--keep-going`) | lint warnings of local packages | Cargo 1.97+ only; older toolchains silently ignore it (checked on 1.96: warnings, exit 0) |

`--force-warn <lint>` keeps a lint at warning level even under `-D warnings` (checked on 1.96, for clippy and rustc lints). `build.warnings = "deny"` fails on any warning, forced ones included, so don't combine it with a ratchet.

## The ratchet

Count the findings per lint (each diagnostic once, though lib and test targets both report it):

```sh
cargo clippy --workspace --all-targets --all-features --keep-going --message-format=json 2>/dev/null \
  | jq -r 'select(.reason == "compiler-message" and .message.code != null)
           | [.message.code.code, .message.spans[0].file_name, .message.spans[0].line_start] | @tsv' \
  | sort -u | cut -f1 | sort | uniq -c | sort -rn
```

Without `jq`, read `--message-format=short` output, or count per lint with any JSON tool the machine has.

```toml
# .cargo/config.toml
[alias]
# Ratchet, from 2026-09-27: each --force-warn is a lint that already fired (count in the comment).
# Delete an entry when its last hit is fixed; never add one.
lint = [
  "clippy", "--workspace", "--all-targets", "--all-features", "--",
  "-D", "warnings",
  "--force-warn", "clippy::needless_return",   # 12
  "--force-warn", "clippy::redundant_clone",   # 7
]
```

- Anything typed after `cargo lint` lands after the alias's `--`, so it goes to clippy: `cargo lint --locked` fails with "Unrecognized option". Put cargo flags inside the alias.
- When the list is empty, replace the alias body with the plain step 3 command (or keep the alias as the one name people type).

## Format: rustfmt

- `cargo fmt --all --check` exits 1 when a file would change; `cargo fmt --all` rewrites. `--all` covers every workspace member; in a workspace with a root package, plain `cargo fmt` formats only that package.
- Config: `rustfmt.toml` or `.rustfmt.toml`, found in the project directory or any parent. `cargo fmt` reads the edition from `Cargo.toml`.
- Unstable options (`imports_granularity`, `group_imports`, ...) need nightly: stable rustfmt prints "unstable features are only available in nightly channel" and ignores them, exit 0. A repo that uses them formats and checks on a pinned nightly (`cargo +nightly-<date> fmt --all --check`); a stable check there would pass code the team's formatter would change.

## Tests

- `cargo test` with no target flags runs the lib and bin unit tests, integration tests, examples (built), and **doc tests**. `--all-targets` means `--lib --bins --tests --benches --examples` and does **not** run doc tests (checked: a broken doc example passes `cargo test --all-targets`, fails plain `cargo test`).
- `--locked` fails when `Cargo.lock` is missing or would change: put it on the CI test step.
- `--all-features` checks every feature at once. Features that exclude each other break it; then use cargo-hack (`cargo hack check --each-feature --workspace`, or `--feature-powerset`), installed with `taiki-e/install-action@cargo-hack`.
- **nextest**, when the project uses it: `cargo nextest run --workspace`, plus `cargo test --workspace --doc`, since nextest doesn't run doc tests. Since 0.9.85 it fails when no tests match (`--no-tests=fail`). Profiles live in `.config/nextest.toml` (`--profile ci`). CI install: `taiki-e/install-action@v<current>` with `tool: cargo-nextest`.

## Supply chain (when the project has it, or asks)

- **cargo-deny**: `deny.toml` (`cargo deny init` writes a commented one); `cargo deny check` runs advisories, bans, licenses, and sources, or name some (`cargo deny check bans licenses`). The exit code is a bitset (advisories 1, bans 2, licenses 4, sources 8). CI: `EmbarkStudios/cargo-deny-action@v<current>`, whose bundled Rust may be older than the project's (`rust-version` input). Its README runs `advisories` as a separate matrix entry with `continue-on-error`, because a newly published advisory turns CI red with no code change; `bans licenses sources` gate normally.
- **cargo-audit**: `cargo audit` reads `Cargo.lock` against the RustSec database. CI: `rustsec/audit-check` (needs a token; it can open issues).
- Getting green with `[advisories] ignore` entries, `cargo audit --ignore`, or a `[bans] skip` or `skip-tree` entry is a suppression (the `audit` skill's floor guard holds the full Rust list): record each as an exception with an owner and an expiry in `CONSTRAINTS.md`, or fix the dependency.

## Pre-commit hooks

- **pre-commit framework** (`.pre-commit-config.yaml` exists): a local hook runs the project's own toolchain.

  ```yaml
  - repo: local
    hooks:
      - id: cargo-fmt
        name: cargo fmt
        entry: cargo fmt --all --check
        language: unsupported   # pre-commit 4.4+; `system` on older versions
        types: [rust]
        pass_filenames: false
      - id: cargo-clippy
        name: cargo clippy
        entry: cargo clippy --workspace --all-targets --all-features -- -D warnings
        language: unsupported
        types: [rust]
        pass_filenames: false
  ```

- **lefthook** (`lefthook.yml`, or one of its other config names): one entry per command under `pre-commit:` `jobs:`, each with `run:` and `glob: "*.rs"`.
- **None**: `.githooks/pre-commit` with `core.hooksPath` (SKILL.md step 4). Each clone runs `git config core.hooksPath .githooks` once; `git commit --no-verify` skips the hook, which is why CI is the gate that counts.

## CI: GitHub Actions

- Hosted runners come with stable Rust, clippy included.
- `Swatinem/rust-cache` goes after the toolchain step (its cache key includes the rustc version).
- `actions-rust-lang/setup-rust-toolchain` reads the toolchain file, caches, and adds problem matchers, but by default sets `CARGO_BUILD_WARNINGS=deny` (input `build-warnings`; set it to `""` beside a ratchet).
- `dtolnay/rust-toolchain@<toolchain>` installs the toolchain its ref names (`@stable`, `@1.89.0`, or `@master` with a `toolchain` input) and makes it the rustup default.