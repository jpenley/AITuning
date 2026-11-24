# Sources

Checked 2026-09-27. Each line names what the skill takes from the page.

## .NET SDK and MSBuild (learn.microsoft.com)

- `dotnet sln`: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-sln — `list` over `.sln`, `.slnx`, and `.slnf`; `dotnet new sln` makes `.slnx` from .NET 10.
- `dotnet reference list`: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-reference-list — lists a project's project references; noun-first form from .NET 10, `dotnet list reference` on SDK 9 and earlier.
- MSBuild switches: https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-command-line-reference — `-getItem` prints an item's values after evaluation without building; `-graphBuild`/`-graph` builds the project graph from project references; `-property`.
- Common project items: https://learn.microsoft.com/en-us/visualstudio/msbuild/common-msbuild-project-items — `ProjectReference` metadata; project references are transitive in .NET Core and .NET 5+ (not in .NET Framework); the `InternalsVisibleTo` item (`Include`, `Key`) for SDK projects.
- MSBuild properties for the .NET SDK: https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props — `DisableTransitiveProjectReferences` turns off implicit `ProjectReference` items.
- Project reference cycles under `-graph`: https://github.com/dotnet/msbuild/issues/9276 — the reported error is `MSB4251: There is a circular dependency involving the following projects`.

## Architecture tests and analyzers

- ArchUnitNET: https://github.com/TNG/ArchUnitNET and https://archunitnet.readthedocs.io/en/latest/guide/ — packages `TngTech.ArchUnitNET` with `.xUnit`, `.xUnitV3`, `.NUnit`, `.MSTestV2` adapters; `new ArchLoader().LoadAssemblies(...).Build()`; `Types().That()...Should().NotDependOnAny(...)`; `Slices().Matching("Module.(*)").Should().BeFreeOfCycles()`; `(*)` one level, `(**)` nested.
- ArchUnitNET source, for exact signatures: https://github.com/TNG/ArchUnitNET/tree/main/ArchUnitNET/Fluent — `ArchRuleDefinition.Types()` in `ArchUnitNET.Fluent`; `SliceRuleDefinition.Slices()` in `ArchUnitNET.Fluent.Slices`; `ResideInNamespace(fullName)` is an exact match (`FullNameEquals`) while `ResideInNamespaceMatching(pattern)` is a regex; the xUnit `Check` extension lives in `ArchUnitNET.xUnit`.
- ArchUnitNET releases: https://github.com/TNG/ArchUnitNET/releases — 0.12 deprecated and 0.13 removed the string-matching overloads of the dependency conditions.
- ArchUnitNET on NuGet: https://www.nuget.org/packages/TngTech.ArchUnitNET — 0.13.4, updated 2026-08-20.
- NetArchTest: https://github.com/BenMorris/NetArchTest and https://www.nuget.org/packages/NetArchTest.Rules — `NetArchTest.Rules` 1.3.2, released 2021-05-23; `Types.InAssembly(...).That()...ShouldNot().HaveDependencyOn(...).GetResult()`; no slice or cycle rules in its documentation.
- NetArchTest.eNhancedEdition: https://github.com/NeVeSpl/NetArchTest.eNhancedEdition and https://www.nuget.org/packages/NetArchTest.eNhancedEdition — a fork of 1.3.2 adding `Slice().ByNamespacePrefix(...).Should().NotHaveDependenciesBetweenSlices()`; 1.4.5, updated 2025-06-04.
- Banned API analyzer: https://github.com/dotnet/roslyn-analyzers/blob/main/src/Microsoft.CodeAnalysis.BannedApiAnalyzers/BannedApiAnalyzers.Help.md — package `Microsoft.CodeAnalysis.BannedApiAnalyzers`; `BannedSymbols.txt` as `AdditionalFiles`; documentation-ID lines including `N:` for a namespace. Diagnostic IDs (RS0030 "Do not use banned APIs"): https://github.com/dotnet/roslyn-analyzers/blob/main/src/Microsoft.CodeAnalysis.BannedApiAnalyzers/Microsoft.CodeAnalysis.BannedApiAnalyzers.md
