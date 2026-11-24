# Tools for Rust crate and module boundaries

Checked against the pages in [SOURCES.md](SOURCES.md) on 2026-09-27; re-check a page before relying on a flag that matters. Examples use a workspace with `crates/*` members; substitute the repo's layout.

## The crate graph

- `cargo metadata --format-version 1 --no-deps` prints JSON without fetching anything: `workspace_members`, `workspace_root`, and per package its `targets` (`kind`, `src_path`) and `dependencies` (`name`, `rename`, `kind`: `null` for normal, `"dev"`, `"build"`; `path` set for path dependencies).
- `cargo tree --workspace --depth workspace` shows only the edges between members; `-e normal,build` (or `-e no-dev`) drops dev-dependencies; `cargo tree -i <crate> --workspace` lists every member that depends on `<crate>`; `--prefix depth` prints a flat list.

## The module graph

The bundled `scripts/edges.py` is the default (SKILL.md step 2). For a picture, or the visibility of every item:

- **cargo-modules** (`cargo install cargo-modules`; it compiles for several minutes). `cargo modules structure --lib [-p <package>] [--cfg-test]` prints the module tree with each item's visibility; `cargo modules dependencies --lib --no-externs --no-sysroot` prints a DOT graph of `owns` and `uses` edges; `cargo modules orphans --deny` fails on `.rs` files no `mod` declaration reaches.
- On cargo-modules 0.27.0, `uses` edges came from `use` declarations and signatures but not from paths inside function bodies, and `--acyclic` checked the item graph, so two modules using each other's items passed it. Take cycles from the bundled script. `--layout none` printed nothing; keep the default layout.

## Visibility: the interface as a file

```rust
//! Billing. Interface: `invoice`, `rate`. Enforced by the compiler (private submodules).

mod gateway; // implementation: invisible outside `billing`
mod tax;

pub(crate) use tax::rate; // or `pub use`, when it's part of the crate's public API

pub(crate) fn invoice(amount: u64) -> u64 {
    gateway::send(amount);
    amount + rate(amount)
}
```

- A path into a private module fails with ``error[E0603]: module `tax` is private``; naming a crate that isn't in the caller's own `[dependencies]` fails with E0433 ("cannot find module or crate").
- `pub(in path)`: the path must name an ancestor module and start with `crate`, `self`, or `super`.
- A `compile_fail` doc test in the module's file keeps a library's submodule from going public again: `cargo test` fails once the path compiles.

  ````rust
  //! ```compile_fail
  //! use shop::billing::tax::rate;
  //! ```
  ````

  A doc test compiles as another crate, so it catches `pub mod tax`, not `pub(crate) mod tax`. It passes on any compile error, and stable rustdoc doesn't check an error code written after it (checked: `compile_fail,E0999` passed on 1.96), so a typo in the path passes forever: prove it by making the module `pub` for one run. nextest doesn't run doc tests.
- `unreachable_pub` (rustc, allow by default) flags `pub` items that can't be reached from outside the crate and suggests `pub(crate)`. Clippy's `redundant_pub_crate` (nursery) pulls the other way (it calls `pub(crate)` inside a private module redundant), and `pub_use` (restriction) forbids re-exports altogether, which fights the interface-by-re-export pattern: leave both off.

## cargo-deny bans

```toml
# deny.toml
[bans]
deny = [
  { crate = "ledger", wrappers = ["billing"], reason = "only billing talks to the ledger" },
]
```

- `wrappers` lists the crates allowed to depend on the banned one directly. Any other member that depends on it directly, dev-dependencies included, fails `cargo deny check bans` with `error[banned]`, preceded by `warning[unmatched-wrapper]` naming the parent. Reaching it through a wrapper passes. Entries also take `use-instead`.
- With an existing `deny.toml`, add entries to its `[bans] deny` list. Without one, `cargo deny init` writes a commented file for all four checks; for boundaries alone, run only `cargo deny check bans`. The exit code has bit 2 set when bans fail.
- CI: `EmbarkStudios/cargo-deny-action@v<current>` with `command: check bans`.

## Clippy's disallowed items

```toml
# crates/web/clippy.toml
disallowed-types = [{ path = "db::Pool", reason = "web goes through repo::Store" }]
disallowed-methods = [{ path = "billing::fee", reason = "fees come from the ledger API" }]
```

- `disallowed_types`, `disallowed_methods`, and `disallowed_macros` are warn-by-default and fire only for configured paths; under `-D warnings` they fail the lint command.
- Clippy uses the first `clippy.toml` or `.clippy.toml` it finds: `CLIPPY_CONF_DIR`, then the crate's own folder, then each parent. A crate-level file replaces the root one for that crate (checked: a root `disallowed-types` entry stopped applying once the crate had its own file), so repeat the root entries in it.
- Leave `allow-invalid` unset: an entry whose path doesn't resolve then errors instead of silently guarding nothing.

## An architecture test on the crate graph

```rust
// crates/app/tests/architecture.rs, with `cargo_metadata` as a dev-dependency of `app`
use cargo_metadata::MetadataCommand;

#[test]
fn only_billing_depends_on_ledger() {
    let meta = MetadataCommand::new()
        .manifest_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../../Cargo.toml"))
        .no_deps()
        .exec()
        .expect("cargo metadata runs");
    let offenders: Vec<String> = meta
        .workspace_packages()
        .into_iter()
        .filter(|p| p.name.as_str() != "billing")
        .filter(|p| p.dependencies.iter().any(|d| d.name == "ledger"))
        .map(|p| p.name.to_string())
        .collect();
    assert!(offenders.is_empty(), "only billing may depend on ledger, found: {offenders:?}");
}
```

- Take the current `cargo_metadata` version from crates.io when adding it. `CARGO_MANIFEST_DIR` is the test's own crate folder, so the manifest path climbs to the workspace root.
- Prefer a `bans` entry when cargo-deny is already in the repo; the test is for rules `wrappers` can't say (for example, "no crate under `crates/domain/` depends on any crate under `crates/adapters/`").
