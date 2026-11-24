# Commands per environment manager

Use the row for the manager the project already uses. Sources: [SOURCES.md](SOURCES.md).

| Need | uv | Poetry | pip |
|---|---|---|---|
| Runner prefix | `uv run <cmd>` | `poetry run <cmd>` | none: activate the project's virtualenv first |
| Add a dev tool | `uv add --dev ruff` (writes `[dependency-groups] dev`) | `poetry add ruff --group dev` | add it to `[dependency-groups] dev` in `pyproject.toml`, or to the dev requirements file the project uses |
| Install the dev environment | `uv sync` (the `dev` group is included by default) | `poetry sync` (matches the lock exactly, removing untracked packages) | `pip install -e .` plus `pip install --group dev`, or `pip install -r requirements-dev.txt` |
| Lock file is current | `uv lock --check` | `poetry check --lock` | none built in; a pinned requirements file is the lock |
| CI install that fails on a stale lock | `uv sync --locked` | `poetry check --lock`, then `poetry sync` | `pip install -r <pinned requirements>` |
| CI setup | `astral-sh/setup-uv` (pin uv's version; `enable-cache: true`) | install Poetry at a pinned version in its own environment (for example `pipx install poetry==<version>`), never into the project's environment; then `actions/setup-python` | `actions/setup-python` with `cache: pip` |

Notes:

- **uv**: `--locked` errors when the lock is out of date instead of updating it; `--frozen` uses the lock without checking it, so it can't catch drift. Projects with the legacy `[tool.uv] dev-dependencies` table keep it: `uv add --dev` writes there.
- **Poetry**: prefer `poetry sync` over `poetry install` so packages removed from the lock don't linger.
- **pip**: `--group` reads PEP 735 dependency groups from `pyproject.toml`. `actions/setup-python` reads the Python version from `.python-version` when no version is given.
