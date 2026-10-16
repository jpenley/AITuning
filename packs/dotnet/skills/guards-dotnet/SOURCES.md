# Sources

Checked 2026-09-27. Each line names what the skill takes from the page.

## .NET SDK and MSBuild (learn.microsoft.com)

- `dotnet format`: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-format — reads `.editorconfig`; `--verify-no-changes` exits non-zero if any file would change; `--include`, `--no-restore`, `--severity`; `whitespace`, `style`, and `analyzers` subcommands; ships in the .NET 6 SDK and later.
- Code analysis overview: https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/overview — CA rules on by default for .NET 5+; `AnalysisMode` values; `-warnaserror` also fails CA warnings unless `CodeAnalysisTreatWarningsAsErrors` is `false`; IDE rules are off on command-line builds until `EnforceCodeStyleInBuild` is `true` and the rule's `.editorconfig` severity is `warning` or `error`; `AnalysisLevel` defaults to `latest`, and pinning it stops SDK upgrades adding rules.
- MSBuild properties for the .NET SDK: https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props — `AnalysisLevel` values (`latest`, `latest-<mode>`, `preview`, `<version>-<mode>`), `AnalysisMode`, `EnforceCodeStyleInBuild`, `CodeAnalysisTreatWarningsAsErrors`, `GenerateDocumentationFile`, `ManagePackageVersionsCentrally`.
- IDE0005: https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/style-rules/ide0005 — on build only with XML documentation enabled.
- Errors and warnings options: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/errors-warnings — `TreatWarningsAsErrors` affects only the C# compiler while the `-warnaserror` switch affects all tasks; `WarningsAsErrors` accepts `nullable`; `NoWarn`.
- Language options: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/language — `Nullable` values `enable`, `disable`, `warnings`, `annotations`; default `disable`, templates set `enable`.
- Directory.Build.props: https://learn.microsoft.com/en-us/visualstudio/msbuild/customize-by-directory — searched upward from each project, first one found wins; inner files import the outer one with `GetPathOfFileAbove`.
- MSBuild switches: https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-command-line-reference — `-warnAsError` with no codes treats all warnings as errors; passed through by `dotnet build`.
- `dotnet test`: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-test — VSTest or Microsoft.Testing.Platform, chosen by `global.json` `test.runner` from the .NET 10 SDK; options differ by runner.
- `global.json`: https://learn.microsoft.com/en-us/dotnet/core/tools/global-json — `sdk.version` needs a full version; `rollForward` policies; `test.runner`.
- `dotnet new` templates: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-new-sdk-templates — `editorconfig`, `buildprops`, `globaljson`, `tool-manifest`.
- Local tools: https://learn.microsoft.com/en-us/dotnet/core/tools/local-tools-how-to-use — `.config/dotnet-tools.json`, `dotnet tool restore`.

## Hooks

- Git hooks: https://git-scm.com/docs/githooks — `core.hooksPath`; a non-zero exit from `pre-commit` aborts the commit; `--no-verify` bypasses it.
- Husky.Net getting started: https://alirezanet.github.io/Husky.Net/guide/getting-started.html — `dotnet new tool-manifest`, `dotnet tool install Husky`, `dotnet husky install`, `dotnet husky add pre-commit -c ...`.
- Husky.Net task runner: https://alirezanet.github.io/Husky.Net/guide/task-runner.html — `.husky/task-runner.json` with a `tasks` array, `group`, `include`, the `${staged}` variable, `dotnet husky run --group pre-commit`. (Its example passes the old `dotnet-format` global-tool name; the skill uses the SDK's `format` command instead.)
- Husky.Net automation: https://alirezanet.github.io/Husky.Net/guide/automate.html — an `AfterTargets="Restore"` target that installs hooks for teammates; `HUSKY=0` disables it in CI.

## CI

- GitHub Actions, building and testing .NET: https://docs.github.com/en/actions/tutorials/build-and-test-code/net — restore, `build --no-restore`, `test --no-build`.
- `actions/setup-dotnet`: https://github.com/actions/setup-dotnet — `dotnet-version`, `global-json-file`; `cache: true` keys on `packages.lock.json` and errors without one. README showed `@v6` on the check date.
- `actions/checkout`: https://github.com/actions/checkout — README showed `@v7` on the check date. (The GitHub Docs tutorial showed older majors, which is why the skill reads the version from each action's README.)
