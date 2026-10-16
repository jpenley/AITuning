---
name: guards-dotnet
description: "Use when setting up or repairing guardrails in a .NET or C# repo (a .sln, .slnx, or .csproj): dotnet format and .editorconfig, analyzers, warnings as errors, nullable, or build and test checks in a pre-commit hook or CI, or when a .NET project has no CI or pre-commit checks."
---

# Guards (.NET)

Guardrails for a .NET solution: format, build, and test, each run locally before a commit and in CI before a merge, and each **proven to bite**. Load the `gates` skill with your skill tool: it holds the procedure (inventory, matching, one command per check, the red baseline, hook, CI, proof, record, report); this skill supplies the .NET commands, keyed to its steps.

The checks, from cheapest to dearest:

| Check | Command | Catches |
|---|---|---|
| Format | `dotnet format --verify-no-changes` | whitespace, code style, and analyzer fixes the `.editorconfig` asks for; exits non-zero when any file would change |
| Build | `dotnet build` with warnings as errors | compiler errors, nullable warnings, CA (quality) and IDE (style) analyzer rules |
| Test | `dotnet test` | behaviour; also architecture tests, if the project has them |

Command details, property meanings, and versions: [SOURCES.md](SOURCES.md). Tool facts drift between SDK releases; when a flag or property surprises you, check the linked page or `--help` rather than memory.

## Inventory sources

The rows `gates` step 1 fills, in .NET:

- **SDK**: `global.json` (pinned SDK, `test.runner`), the target frameworks in each `.csproj`.
- **Build settings**: every `Directory.Build.props` and `Directory.Build.targets` (MSBuild imports the nearest one above each project and stops; inner files import outer ones explicitly), plus per-project `TreatWarningsAsErrors`, `WarningsAsErrors`, `Nullable`, `AnalysisLevel`, `AnalysisMode`, `EnforceCodeStyleInBuild`, and existing `NoWarn` lists.
- **Style**: `.editorconfig` files and the severities they set.
- **Analyzer packages**: `PackageReference`s to StyleCop, Roslynator, SonarAnalyzer, Meziantou, and the like; `Directory.Packages.props` if versions are central.
- **Hooks**: `.husky/` with `.config/dotnet-tools.json` (Husky.Net), `.pre-commit-config.yaml`, `lefthook.yml`, `core.hooksPath`, `.git/hooks/`.
- **CI**: `.github/workflows/`, `azure-pipelines.yml`, `.gitlab-ci.yml`, build scripts (Cake, Nuke, `build.ps1`/`build.sh`), and the commands they actually run.
- **Current state**: run format, build, and test once and record how many warnings, by ID, and which fail.

Matching, in .NET: a repo with Husky.Net gets a new Husky task; a repo with an Azure Pipelines file gets a step there, not a GitHub workflow beside it; settings go in the existing `Directory.Build.props`, not a new one.

## Build settings

Set these once in the root `Directory.Build.props` (or the file the repo already uses), so every project inherits them:

```xml
<Project>
  <PropertyGroup>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
  </PropertyGroup>
</Project>
```

- `TreatWarningsAsErrors` affects only the C# compiler (including analyzer diagnostics). `dotnet build -warnaserror` (used in the CI template below) also fails on MSBuild and NuGet warnings; drop it there if only compiler and analyzer warnings should block.
- `EnforceCodeStyleInBuild` only runs IDE rules whose `.editorconfig` severity is `warning` or `error`. Without an `.editorconfig`, create one (`dotnet new editorconfig`) and set the severities the team wants. IDE0005 (unnecessary `using`) runs on build only when `GenerateDocumentationFile` is `true`.
- `AnalysisLevel` without a version tracks the SDK, so an SDK upgrade can add new warnings; pin a version (`9.0-recommended`) when upgrades must not break the build, together with a `global.json` pin.

Done when `dotnet build` passes on the clean tree with the new settings (or at the ratchet level below).

## A solution that doesn't build clean

Follow `gates` step 4: measure the warnings by ID with their count, show the user, and ask whether to fix first or ratchet. The .NET ratchet: turn on as errors what is already clean (for example `<WarningsAsErrors>nullable</WarningsAsErrors>` when nullable is clean but CA rules aren't), or turn warnings-as-errors on project by project as each gets clean; each category or project left out is a ratchet entry. Getting green by adding `NoWarn` entries, `#pragma warning disable`, or `severity = none` lines is a new suppression, which the constraint floor forbids.

## Pre-commit hook

Format runs on staged files with Husky.Net's `${staged}`; the plain hook checks the whole tree. The build goes in the hook if it takes seconds.

When the repo has no hook system: use Husky.Net when it already uses dotnet local tools (`.config/dotnet-tools.json`), since its restore target installs the hooks for every teammate; otherwise the plain `.githooks/pre-commit` from `gates`.

Husky.Net task in `.husky/task-runner.json`, wired to the hook with `dotnet husky add pre-commit -c "dotnet husky run --group pre-commit"`:

```json
{
  "tasks": [
    {
      "name": "format",
      "group": "pre-commit",
      "command": "dotnet",
      "args": ["format", "--verify-no-changes", "--include", "${staged}"],
      "include": ["**/*.cs"]
    }
  ]
}
```

Plain hook (`.githooks/pre-commit`, LF line endings, executable):

```sh
#!/bin/sh
set -e
dotnet format --verify-no-changes
dotnet build
```

## CI

Restore, format check, build, test. For GitHub Actions with no CI present:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v<current>
      - uses: actions/setup-dotnet@v<current>
        with:
          global-json-file: global.json
      - run: dotnet restore
      - run: dotnet format --verify-no-changes --no-restore
      - run: dotnet build --no-restore -warnaserror
      - run: dotnet test --no-build
```

- Action versions: the READMEs linked in SOURCES.md.
- Without a `global.json`, use `dotnet-version:` with the SDK the projects target, or add a `global.json` so local and CI builds agree.
- `setup-dotnet`'s `cache: true` needs a `packages.lock.json`; leave caching off unless the repo has lock files.
- With Husky.Net's restore target, set `HUSKY: 0` in the job's `env` so CI doesn't try to install hooks.
- Under `test.runner` = `Microsoft.Testing.Platform` in `global.json`, `dotnet test` takes MTP options; check the `dotnet test` page in SOURCES.md before adding test flags.
- The job name to make a required status check is `build`.

## Violations to plant

For `gates` step 7:

| Gate | A violation to plant |
|---|---|
| Format | Mangle the indentation or spacing of one line in a `.cs` file |
| Nullable | `string s = null;` in a method (CS8600, now an error) |
| Analyzer or style | A pattern for a rule the settings made an error, for example an unused `using` for IDE0005 |
| Test | Flip an assertion's expected value |
| Pre-commit hook | Stage the format violation and run `git commit`; the commit must be refused |
| CI | Push the violation on a throwaway branch or draft pull request and watch the job go red; delete the branch after |

Why a gate stayed green, in .NET: the plant is in a project the build doesn't include, the rule's severity is still `suggestion`, or the hook isn't installed in this clone.

## Report

Per `gates`, with the ratchet left as warning IDs and counts.
