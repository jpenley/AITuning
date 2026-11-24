# Sources

Checked 2026-09-27. Versions current then: ruff 0.16.9, mypy 2.3.1, pyright 1.1.414, pytest 9.1.1, pre-commit 4.6.2, pip 26.2.1, Poetry 2.5. Re-check a page before relying on a detail that may have moved.

## Lint and format (ruff)

- Configuration files and precedence (`.ruff.toml` > `ruff.toml` > `pyproject.toml [tool.ruff]`), `select` / `extend-select`, `ruff format --check`: https://docs.astral.sh/ruff/configuration/
- Pre-commit hooks (`astral-sh/ruff-pre-commit`, ids `ruff-check` and `ruff-format`) and `astral-sh/ruff-action`: https://docs.astral.sh/ruff/integrations/
- `RUF100` unused `noqa`: https://docs.astral.sh/ruff/rules/unused-noqa/
- `--force-exclude`: `ruff check --help` and `ruff format --help` (ruff 0.16.9)

## Types

- mypy config discovery (`mypy.ini`, `.mypy.ini`, `pyproject.toml [tool.mypy]`, `setup.cfg [mypy]`), `strict`, `files`, `packages`, `[[tool.mypy.overrides]]`, `warn_unused_ignores`: https://mypy.readthedocs.io/en/stable/config_file.html
- mypy in pre-commit runs isolated with `--ignore-missing-imports` unless dependencies are added: https://github.com/pre-commit/mirrors-mypy
- pyright config (`pyrightconfig.json` takes precedence over `pyproject.toml [tool.pyright]`), `typeCheckingMode` (`off`, `basic`, `standard` default, `strict`), `include`, `reportUnnecessaryTypeIgnoreComment`: https://microsoft.github.io/pyright/#/configuration and https://github.com/microsoft/pyright/blob/main/docs/configuration.md

## Tests (pytest)

- Config files and precedence (`pytest.toml`, `pytest.ini`, `pyproject.toml [tool.pytest]` from 9.0 or `[tool.pytest.ini_options]`, `tox.ini`, `setup.cfg`): https://docs.pytest.org/en/stable/reference/customize.html
- Exit codes (5 = no tests collected): https://docs.pytest.org/en/stable/reference/exit-codes.html
- Coverage gate (`--cov-fail-under`, `[tool.coverage.report] fail_under`): https://pytest-cov.readthedocs.io/en/latest/config.html

## Environment managers

- uv: `--locked`, `--frozen`, `uv lock --check`: https://docs.astral.sh/uv/concepts/projects/sync/
- uv dev dependencies (`[dependency-groups]`, `uv add --dev`, legacy `[tool.uv] dev-dependencies`): https://docs.astral.sh/uv/concepts/projects/dependencies/
- uv in GitHub Actions (`uv sync --locked`, `enable-cache`): https://docs.astral.sh/uv/guides/integration/github/ and https://github.com/astral-sh/setup-uv
- Poetry commands (`sync`, `install`, `check --lock`, `run`): https://python-poetry.org/docs/cli/
- Poetry groups (`poetry add <pkg> --group dev`): https://python-poetry.org/docs/managing-dependencies/
- Poetry in CI (pin the version, install it in its own environment): https://python-poetry.org/docs/
- pip (`--group`, `-r`, `-e`): https://pip.pypa.io/en/stable/cli/pip_install/

## Hooks and CI

- pre-commit (`.pre-commit-config.yaml`, `install`, `run --all-files`, `autoupdate`, `stages`, `default_install_hook_types`, `repo: local`, `language: unsupported` replacing `system` in 4.4.0, `pass_filenames`, `types`, `--show-diff-on-failure`): https://pre-commit.com/
- `pre-commit run --hook-stage`: `pre-commit run --help` (pre-commit 4.6.2)
- GitHub Actions workflow syntax (`on`, `permissions`): https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- `actions/setup-python` (`cache: pip|pipenv|poetry`, `.python-version`): https://github.com/actions/setup-python
- `gh run watch --exit-status`: https://cli.github.com/manual/gh_run_watch
- Required status checks and rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

## Checked by running

The local-hook layout in step 3 (`repo: local`, `language: unsupported`, `uv run mypy src tests`, `pass_filenames: false`, a `pre-push` test hook) was run with pre-commit 4.6.2, ruff 0.16.9, and mypy 2.3.1 on a scratch uv project: a planted `int = "str"` failed the mypy hook and passed again once reverted.
