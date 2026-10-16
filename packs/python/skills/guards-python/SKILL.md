---
name: guards-python
description: "Use when a Python project (pyproject.toml, requirements.txt, uv, Poetry, or pip) needs its guardrails set up, repaired, or proven: ruff lint and format, mypy or pyright types, pytest, pre-commit hooks, or a CI workflow, including a Python repo with no guardrail at all."
---

# Guards (Python)

The guardrails for a Python project: lint, format, types, and tests, run by pre-commit on every commit and by CI on every push, each one **proven to bite**. Load the `gates` skill with your skill tool: it holds the procedure (inventory, matching, one command per check, the red baseline, hook, CI, proof, record, report); this skill supplies the Python commands, keyed to its steps.

Tool facts here are version-sensitive. Every command and key comes from the pages in [SOURCES.md](SOURCES.md); when you pin a version (a hook `rev`, an action, a tool), look up the current release on its page or with `pre-commit autoupdate`, never from memory.

## Inventory sources

| Look at | It tells you |
|---|---|
| `uv.lock`, `poetry.lock` or `[tool.poetry]`, `requirements*.txt`, `pylock.toml` | The environment manager, and so the **runner** every command goes through (`uv run`, `poetry run`, or the activated virtualenv for pip). Per-manager commands: [MANAGERS.md](MANAGERS.md) |
| `[tool.ruff]`, `ruff.toml`, `.ruff.toml`; `.flake8`, `[tool.black]`, `[tool.isort]` | The linter and formatter, and their rules |
| `[tool.mypy]`, `mypy.ini`, `.mypy.ini`, `setup.cfg [mypy]`; `[tool.pyright]`, `pyrightconfig.json` | The type checker: mypy or pyright |
| `[tool.pytest]`, `[tool.pytest.ini_options]`, `pytest.ini`, `pytest.toml`, `tox.ini`, `tests/` | The test runner and where tests live |
| The dev dependency group (`[dependency-groups]`, `[tool.poetry.group.dev.dependencies]`, `requirements-dev.txt`) | Which tools are installed, at which versions |
| `.pre-commit-config.yaml`, `.github/workflows/*.yml`, `Makefile`, `noxfile.py`, `tox.ini`, README, CONTRIBUTING | What runs today, and the commands people already type |

Matching, in Python: black stays black, mypy stays mypy, a `Makefile` target stays the entry point people know, and each keeps its config. For a dimension with no tool: ruff for lint and format, mypy for types (a plain Python package, no extra runtime), pytest for tests.

## One command per dimension

Each runs through the project's runner; the hook may add flags such as `--force-exclude`:

| Dimension | Command (after the runner) | Notes |
|---|---|---|
| Lint | `ruff check` | Scope comes from config (`src`, `include`) |
| Format | `ruff format --check` | Exits non-zero if any file would change |
| Types | `mypy` or `pyright` | Set what to check in config (`files` / `packages` for mypy, `include` for pyright) so the bare command covers `src` and `tests` |
| Tests | `pytest` | Exit 5 means no tests were collected: a wrong path, not a pass |
| Lock | the manager's lock check (MANAGERS.md) | The lock file matches `pyproject.toml` |

Install each missing tool as a dev dependency through the manager (MANAGERS.md).

**Red on existing code**: follow `gates` step 4 (measure, show the count, ask). The Python ratchet is a narrower start **in config** (fewer rules, fewer paths, a per-module override), each rule or path left out on the ratchet list, widened as it gets clean. Suppression comments (`# noqa`, `# type: ignore`, `# pyright: ignore`, `# pragma: no cover`) stay out: the floor forbids new ones.

## Pre-commit hooks

The pre-commit framework, in `.pre-commit-config.yaml`. Run every hook that needs the project's environment (the type checker, the tests, the linter when it's a pinned dev dependency) as a **local hook through the runner**: pre-commit's own hook environments are isolated from the project, so a type checker there can't see the project's imports, and a separately pinned ruff drifts from the one CI runs.

```yaml
default_install_hook_types: [pre-commit, pre-push]
repos:
  - repo: local
    hooks:
      - id: ruff-check
        name: ruff check
        entry: uv run ruff check --force-exclude
        language: unsupported   # pre-commit 4.4+; `system` on older versions
        types: [python]
      - id: ruff-format
        name: ruff format
        entry: uv run ruff format --check --force-exclude
        language: unsupported
        types: [python]
      - id: types
        name: mypy
        entry: uv run mypy
        language: unsupported
        pass_filenames: false
        types: [python]
      - id: tests
        name: pytest
        entry: uv run pytest -q
        language: unsupported
        pass_filenames: false
        stages: [pre-push]
```

Swap `uv run` for the project's runner. Add `pre-commit` as a dev dependency, then `pre-commit install` (installs both hook types from `default_install_hook_types`) and `pre-commit run --all-files`.

Done when `pre-commit run --all-files` passes and `pre-commit run --hook-stage pre-push --all-files` runs the tests.

## CI

```yaml
name: checks
on: [push, pull_request]
permissions:
  contents: read
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<current>
      - uses: astral-sh/setup-uv@<current>
      - run: uv sync --locked
      - run: uv run ruff check
      - run: uv run ruff format --check
      - run: uv run mypy
      - run: uv run pytest
```

Install from the lock file per manager (MANAGERS.md); the locked install checks the lock.

## Violations to plant

For `gates` step 7, in the hook and in CI:

| Check | Plant |
|---|---|
| Lint | `import os` unused at the top of a module in `src` |
| Format | `x=[1,2 ,3]` on its own line |
| Types | `count: int = "three"` |
| Tests | a new test containing `assert 1 == 2` |
| Lock (CI only) | a new dependency added to `pyproject.toml` by hand, without re-locking |

Run a hook alone with `pre-commit run <hook-id> --all-files`; watch a CI run with `gh run watch <run-id> --exit-status`.

Why a check stayed green, in Python: a path the config excludes, `pass_filenames` handing it nothing, an isolated hook environment missing the project's imports, a job that never triggers.

## Record

Beyond `gates` step 8: make stale suppressions visible so the floor can hold, with ruff rule `RUF100` (unused `noqa`), mypy `warn_unused_ignores`, and pyright `reportUnnecessaryTypeIgnoreComment`. The instruction-file line names `pre-commit run --all-files`, or the commands above.
