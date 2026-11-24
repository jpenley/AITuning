---
name: seams-rust
description: "Use when measuring or enforcing module boundaries in a Rust crate or Cargo workspace: the crate graph, cycles between modules, paths that reach past a module's mod.rs or a crate's lib.rs re-exports, pub items that should be pub(crate), fan-in and fan-out, or cargo-deny bans and visibility rules that keep one crate or module out of another's internals."
---

# Seams (Rust)

Tooling that measures the edges of a Rust workspace and makes a boundary **mechanical**. Load the `gates` skill with your skill tool: its Part 2 holds the procedure (map, measure, decide, enforce, prove, document, report); this skill supplies the Rust commands. The vocabulary is the `modules` skill's (**module**, **interface**, **seam**, **depth**).

Commands, config, and the architecture test: [TOOLS.md](TOOLS.md). Where each fact was checked: [SOURCES.md](SOURCES.md). Tool facts drift between releases; when a flag surprises you, check the linked page or `--help` rather than memory.

## What the terms are in Rust

- **Module**, at two scales: a **crate** (a workspace member) and a `mod` inside a crate (a file `billing.rs` or `billing/mod.rs`, or an inline `mod billing { ... }`).
- **Interface**: a crate's is what `lib.rs` makes reachable; a module's is the items its own file declares visible to its callers plus what it re-exports (`pub use tax::rate;`). Everything below is implementation, whatever it's marked.
- **Deep reach**: a path from outside a module into one of its submodules, such as `crate::billing::tax::rate` from `orders`, or `billing::tax::rate` from another crate. It compiles only because the submodule is visible (`pub mod tax`, `pub(crate) mod tax`), and it's worst when the module already re-exports the name (`crate::billing::rate`).
- **Cycle**: crates can't cycle through normal or build dependencies (Cargo refuses a "cyclic package dependency"), but they can through dev-dependencies. Modules inside a crate cycle freely: that's where cycles hide.
- **Visibility**: private (the default) reaches the module and its descendants; `pub(super)` the parent; `pub(in crate::a)` that ancestor; `pub(crate)` the whole crate; `pub` anyone who can also reach every parent module.

## Map the crates and modules

List the workspace members and their path dependencies on each other (`cargo metadata --format-version 1 --no-deps`, or `cargo tree --workspace --depth workspace`), and note which are libraries, binaries, and test-only. Existing boundary tooling: `[bans]` in `deny.toml`, `disallowed-*` lists in a `clippy.toml`, `unreachable_pub` in a `[lints]` table, an architecture test (a `cargo_metadata` dev-dependency).

## Measure the edges

Run the bundled script, `scripts/edges.py` in the folder that holds this SKILL.md (Python 3, standard library only; it runs `cargo metadata --no-deps` and reads the source, without building):

```
python3 <this folder>/scripts/edges.py [--manifest-path <Cargo.toml>] [--crate <name>] [--at <module::path>] [--include-tests]
```

It prints a report on stderr and the same data as JSON on stdout:

- **crates**: fan-in and fan-out per member, dev-dependencies, and crate cycles (dev-dependency ones);
- **modules**, per crate's library (or binaries, when it has none), for the children of the root or of `--at`: fan-in and fan-out, **cycles** at every level with the path and `file:line` that makes each link, and **deep reaches** with importer, path, the interface passed, the submodule and its visibility, and the re-exported path to use instead when one exists;
- **public modules no other member uses**: candidates for `pub(crate)`, unless the crate is published for outside users;
- **unresolved modules**: `mod` declarations it couldn't find a file for, which it can't measure.

Exit 0 means no cycles or deep reaches, 1 findings, 2 it couldn't run. Run it on the workspace, then with `--crate` and `--at` on each hot spot. It skips `#[cfg(test)]` modules unless `--include-tests` is given, since unit tests reach into their own module by design.

The script reads source as text, so paths made by macros and names reached through a glob import (`use a::*`) are invisible to it. For the boundary you're about to enforce, get the exact list from the compiler: make the module's submodules private for one build (`pub mod tax;` or `pub(crate) mod tax;` becomes `mod tax;`), run `cargo check --workspace --all-targets --all-features`, and every ``error[E0603]: module `tax` is private`` is one reach, with its file and line. Restore the files afterwards unless the user picks this as the fix.

## Enforce it

The mechanisms, strongest first; each must run in `cargo check`, `cargo clippy`, `cargo test`, or `cargo deny check`:

1. **Visibility, inside a crate.** Make the module's submodules private (`mod tax;`) and re-export its interface from its own file (`pub(crate) use tax::rate;`, or `pub use` if it's part of the crate's public API). Narrow items only the parent needs to `pub(super)` or `pub(in crate::billing)`. A caller outside then fails to compile with E0603. Visibility can't express direction between siblings: `orders` and `billing` both see each other's `pub(crate)` items. To stop a library's submodule being made `pub` again later, add a `compile_fail` doc test (TOOLS.md).
2. **Crates, when direction matters.** Split the module into its own workspace crate. A crate can name only the crates in its own `[dependencies]` (a crate reached through another fails with E0433), only `pub` items cross, and Cargo refuses dependency cycles, so the manifest becomes the direction rule.
3. **cargo-deny bans**, for crate rules the manifests don't state, such as "only `billing` depends on `ledger`": a `deny` entry with `wrappers` (TOOLS.md). `cargo deny check bans` then fails with `error[banned]`, dev-dependencies included.
4. **Clippy's `disallowed-types` and `disallowed-methods`**, when a crate must depend on another but not use certain items (`web` never touches `db::Pool`): a `clippy.toml` in that crate's folder. It replaces the workspace's `clippy.toml` for that crate rather than adding to it, so copy any root entries into it.
5. **An architecture test**, for crate-graph rules none of these express: a test that reads `cargo metadata` and asserts the edges (TOOLS.md), in a crate CI already tests.

Keep crate interfaces honest with `unreachable_pub = "warn"` in `[workspace.lints.rust]` (an error once the lint command has `-D warnings`): it flags `pub` items nothing outside their crate can reach, each an interface claim that isn't real and should be `pub(crate)`. To see what it flags first, run `cargo clippy --workspace --all-targets -- -W unreachable_pub`; if it already fires, it is a red baseline like any other.

**Existing violations**: follow `gates`' red-baseline step (measure, show the count, ask). Fixing means moving each caller onto the interface (the script's "use instead" path, or a new deliberate re-export), or moving the code to the side of the boundary it belongs on, in the same change as the rule. The Rust ratchet: the rule goes on for the modules or crates already clean, and each caller still to move is a listed entry; for `unreachable_pub`, a `--force-warn unreachable_pub` entry in the `cargo lint` alias (`guards-rust`). Getting green with `#[allow(...)]` or `#[expect(...)]`, a `pub` widened back, or an extra name in `wrappers` is a suppression, which the constraint floor forbids.

## Violations to plant

Run each through the same command CI runs, and use `git restore <file>` to revert:

- visibility: `use crate::billing::tax::rate;` in the caller, plus a call to `rate`;
- crate direction or bans: the forbidden crate added to the offending member's `[dependencies]` as a path dependency;
- disallowed items: a use of the banned type or method in that crate;
- `unreachable_pub`: a new `pub fn` inside a private module;
- a `compile_fail` doc test: the guarded submodule made `pub mod` for one run.

The failure names the plant: E0603, `error[banned]`, `disallowed_types`, the test's assertion message, or "Test compiled successfully, but it's marked `compile_fail`".

Why a rule stayed green, in Rust: the plant isn't compiled (a `#[cfg(feature)]` gate without `--all-features`), `wrappers` doesn't name the package exactly, the CI step doesn't run the `bans` check, a crate-level `clippy.toml` shadows the one you edited, or the test lives in a crate CI doesn't test.

## Document the boundary

Next to the code: a `//!` comment at the top of the module's file (or the crate's `lib.rs`) saying what its interface is and which check enforces it.
