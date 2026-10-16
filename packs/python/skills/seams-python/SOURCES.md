# Sources

Checked 2026-09-27. Versions current then: import-linter 2.15, grimp 3.17, pydeps 3.0.8, ruff 0.16.9, tach 0.35.1, pre-commit 4.6.2. Re-check a page before relying on a detail that may have moved.

## import-linter

- Configuration (`pyproject.toml [tool.importlinter]`, `.importlinter`, `setup.cfg`; `root_package`, `root_packages`, `include_external_packages`, `exclude_type_checking_imports`; contract `id`): https://import-linter.readthedocs.io/en/stable/get_started/configure/ (source: https://github.com/seddonym/import-linter/blob/main/docs/get_started/configure.md)
- Running (`lint-imports`, `--contract`, `--no-cache`, `--cache-dir` default `.import_linter_cache`; the pre-commit local hook with `pass_filenames: false`): https://import-linter.readthedocs.io/en/stable/get_started/run/ (source: `docs/get_started/run.md`)
- Contract types (`forbidden`, `protected`, `layers`, `independence`, `acyclic_siblings`), wildcards, and shared options (`ignore_imports`, `unmatched_ignore_imports_alerting` default `error`, `broken_contract_guidance`): https://import-linter.readthedocs.io/en/stable/contract_types/ (sources: `docs/contract_types/*.md` in the repo above)
- Interactive UI (`import-linter explore`, `ui` extra): https://import-linter.readthedocs.io/en/stable/ui/

## grimp

- `build_graph` (`exclude_type_checking_imports`, `cache_dir`), `find_children`, `find_modules_directly_imported_by`, `find_modules_that_directly_import`, `get_import_details` (keyword arguments), `find_downstream_modules`, `find_upstream_modules`, `find_shortest_chain`, `nominate_cycle_breakers`: https://grimp.readthedocs.io/en/stable/usage.html (source: https://github.com/python-grimp/grimp/blob/main/docs/usage.rst)

## Other views

- pydeps (`--show-cycles`, `--show-deps`, `--no-output`, `--max-bacon`, `--only`, Graphviz requirement): https://pydeps.readthedocs.io/en/latest/
- `ruff analyze graph` (`--direction dependencies|dependents`, `--detect-string-imports`; prints "experimental and may change without warning"): `ruff analyze graph --help` (ruff 0.16.9) and the `analyze` settings at https://docs.astral.sh/ruff/settings/#analyze
- ruff `PLC2701` import-private-name (preview only): https://docs.astral.sh/ruff/rules/import-private-name/
- tach (`tach check`, `tach.toml`): https://docs.gauge.sh/usage/commands
- `uv run --with` (packages layered on the project environment, ephemeral): https://docs.astral.sh/uv/reference/cli/
- pre-commit `language: unsupported` (renamed from `system` in 4.4.0): https://pre-commit.com/

## Checked by running

On a scratch uv package with a planted cycle and a planted private deep import (import-linter 2.15, grimp 3.17): the `protected` contract with `protected_modules = ["pkg.x.*"]` and `allowed_importers = ["pkg.x"]` flagged the deep import with its line and allowed `pkg.x`'s own modules to import each other; a `forbidden` contract with `forbidden_modules = ["pkg.x.*"]` and `allow_indirect_imports = true` flagged the same deep import from one source package; `acyclic_siblings` and `layers` flagged the cycle; `lint-imports` exited 1 on a broken contract; an import inside a function body was caught; a module in a directory without `__init__.py` was not in the graph. `scripts/edges.py --selftest` plants a cycle and a deep private import and checks both are reported, a clean package reports nothing, and an unimportable package exits 2.
