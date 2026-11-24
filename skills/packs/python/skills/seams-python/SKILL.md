---
name: seams-python
description: "Use when a Python package's imports need measuring or enforcing: import cycles, the import graph, fan-in and fan-out, deep imports past __init__.py into submodules or _private modules, or import-linter or grimp rules that keep one Python package out of another's internals."
---

# Seams (Python)

Tooling that measures the edges of a Python codebase and makes a boundary mechanical. Load the `gates` skill with your skill tool: its Part 2 holds the procedure (map, measure, decide, enforce, prove, document, report); this skill supplies the Python commands.

Use the `modules` skill's vocabulary: **module**, **interface**, **seam**, **depth**. In Python:

- A package's **interface** is what its `__init__.py` exposes: the names it defines or re-exports, and `__all__` when present.
- A **deep import** reaches past that `__init__.py` into a submodule (`from ledger.accounts.service import ...` from outside `accounts`). An import of a `_private` module or name from outside its package is always a deep import.
- A **cycle** is two or more sibling packages that import each other, directly or through a chain.

Tool facts here are version-sensitive; sources are in [SOURCES.md](SOURCES.md).

## Make the package importable

The graph tools read the installed package, so they run inside the project's environment:

- Find the top-level package names (under `src/` or at the root) and the environment manager (`uv.lock` → `uv run`, `poetry.lock` → `poetry run`, otherwise the activated virtualenv).
- Sync the environment so the project itself is installed (`uv sync`, `poetry sync`, or `pip install -e .`).
- Check for boundary tooling the project already has: `[tool.importlinter]` or `.importlinter` (import-linter), `tach.toml` (tach).

Done when `<runner> python -c "import <package>"` succeeds.

## Measure the edges

Run the bundled script, `scripts/edges.py` in the folder that holds this SKILL.md, with grimp layered on the project environment (uv: `uv run --with grimp python <that folder>/scripts/edges.py <package>`; otherwise install `grimp` into the dev environment first):

```
python <that folder>/scripts/edges.py <package> [--at <subpackage>] [--exclude-type-checking]
```

It measures the children of `<package>` (or of `--at`) as modules and prints, with a JSON copy on stdout:

- **fan-in and fan-out** per child: how many siblings import it, how many it imports
- **cycles**, with the smallest set of imports that would break each (grimp's `nominate_cycle_breakers`), for the package and each subpackage
- **deep imports**, each with importer, imported module, the interface it bypasses, whether it is private, and the line number

Exit 0 means no cycles or deep imports, 1 means findings, 2 means it couldn't run (grimp missing, package not importable). Run it at the root, then with `--at` on each hot spot. Add `--exclude-type-checking` to see only runtime imports (imports under `if TYPE_CHECKING:` can't cause runtime cycles, but they still couple the modules).

Other views when they help:

- `ruff analyze graph` (no extra install where ruff is present; experimental): a JSON map from each file to the files it imports; `--direction dependents` gives the reverse, fan-in by file.
- `pydeps <package> --show-cycles` draws the cycles (needs Graphviz's `dot`); `--no-output --show-deps` prints the dependency data instead.
- `import-linter explore <package>` opens a browser view of the package's children (needs import-linter's `ui` extra); for a human, not a scripted step.

## Write the boundary as a contract

Put the rule where the project's existing tooling keeps rules (`tach.toml` for tach). Otherwise use **import-linter**, configured in `pyproject.toml` and run with `lint-imports`. Add it as a dev dependency so the hook and CI run the locked version.

Pick the contract type from what must stay true:

| Rule | Contract | Key fields |
|---|---|---|
| Callers use `X` only through its interface (no deep imports) | `protected` | `protected_modules = ["pkg.x.*"]`, `allowed_importers = ["pkg.x"]` |
| `A` uses `X` only through its interface (other callers not yet covered) | `forbidden` | `source_modules = ["pkg.a"]`, `forbidden_modules = ["pkg.x.*"]`, `allow_indirect_imports = true` (so `pkg.a → pkg.x → pkg.x.impl` stays legal) |
| `A` may import `B`, never the reverse, even indirectly | `layers` | `layers = ["pkg.a", "pkg.b"]` (highest first) |
| `A` never imports `B` | `forbidden` | `source_modules`, `forbidden_modules` |
| Peers never import each other | `independence` | `modules` |
| No cycles between the children of a package, at any depth | `acyclic_siblings` | `ancestors` |

```toml
[tool.importlinter]
root_package = "ledger"

[[tool.importlinter.contracts]]
id = "accounts-interface"
name = "Only accounts reaches past accounts/__init__.py"
type = "protected"
protected_modules = ["ledger.accounts.*"]
allowed_importers = ["ledger.accounts"]
broken_contract_guidance = "Import from ledger.accounts. If a caller needs more, add it to accounts/__init__.py deliberately."
```

`protected` with `allowed_importers` set to the package itself lets the package's own modules import each other while everything outside goes through `__init__.py`. Give every contract an `id` so it can be run alone (`lint-imports --contract <id>`).

**Existing violations**: follow `gates`' red-baseline step (measure, show the count, ask). Fixing means moving the caller onto the interface: re-export the needed name from the package's `__init__.py` if it belongs in the interface, or move the code to the side of the boundary it belongs on. The Python ratchet is the contract's `ignore_imports` (`"ledger.payments.transfer -> ledger.accounts._repo"`), one line per remaining violation, each removed as it's fixed: import-linter errors on an ignore that no longer matches, so the list can only shrink.

Wire `lint-imports` into the project's checks: a local pre-commit hook through the runner (`repo: local`, `entry: uv run lint-imports`, `language: unsupported` on pre-commit 4.4+ or `system` before, `pass_filenames: false`) and a CI step beside the other checks. Add `.import_linter_cache` to `.gitignore`.

Done when `lint-imports` exits 0 with every contract kept, from the hook and from CI.

## Violations to plant

Run each contract alone with `lint-imports --contract <id>`. Plant, in real code on the guarded side: for an interface contract, a deep import into an existing internal module (`from ledger.accounts._repo import load` at the top of a `payments` module); for a layer, the reverse import; for acyclic siblings, the import that closes a loop. Broken is exit 1, with the planted import and its line in the report. Run the hook on it too (`pre-commit run <hook-id> --all-files`).

Why a contract stayed kept, in Python: the planted file isn't in the graph (a directory without `__init__.py` is invisible unless it's a namespace package the config names), the wildcard doesn't match (`pkg.x.*` matches children of the package `pkg.x`, not a module `x.py`), the plant is under `if TYPE_CHECKING:` while `exclude_type_checking_imports` is on, or the `ignore_imports` list covers it.

## Document the boundary

- Next to the code: a docstring at the top of the guarded package's `__init__.py` saying what its interface is and which contract enforces it.
- The instruction-file pointer: "Import boundaries are contracts in `pyproject.toml` (`[tool.importlinter]`); run `lint-imports` before finishing."
- The `CONSTRAINTS.md` row: "Architecture boundaries | every contract kept | `<runner> lint-imports` | every edit and CI".

The report lists every cycle with its breakers and any `ignore_imports` left with their owner.
