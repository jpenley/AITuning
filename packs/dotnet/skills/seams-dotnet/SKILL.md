---
name: seams-dotnet
description: "Use when measuring or enforcing module boundaries in a .NET or C# solution: the project reference graph between .csproj files, cycles between assemblies or namespaces, deep reaches into another assembly's internals, fan-in and fan-out, InternalsVisibleTo, or architecture tests with ArchUnitNET or NetArchTest."
---

# Seams (.NET)

Tooling for the edges of **modules** in a .NET solution. Load the `gates` skill with your skill tool: its Part 2 holds the procedure (map, measure, decide, enforce, prove, document, report); this skill supplies the .NET commands. The vocabulary is the `modules` skill's (**module**, **interface**, **seam**, **depth**).

In .NET a module usually maps to a **project** (one `.csproj`, one assembly), and inside a large project to a **namespace**. A module's **interface** is its entry points: the `public` types of its contract (often a `*.Contracts` or `*.Abstractions` project, or the module's root namespace). Everything else is internals, whatever its access modifier says.

Command details, package names, and versions: [SOURCES.md](SOURCES.md). Tool facts drift between SDK releases; when a command surprises you, check the linked page or `--help` rather than memory.

## Measure the edges

Work from the solution file (`.sln`, `.slnx`, or `.slnf`).

**The project graph.** List the projects (`dotnet sln list`), then each project's direct references (`dotnet reference list --project <path>`; on SDK 9 and earlier `dotnet list <path> reference`, or `dotnet msbuild <path> -getItem:ProjectReference`). Note which projects are tests and which are hosts (web, worker, console), since they sit at the top of the graph by design.

**Cycles.** At project level MSBuild refuses a reference cycle (`dotnet build -graph` names it as MSB4251), so a solution that builds has none; say so and move to namespaces. Namespace cycles inside a project are the ones that hide. Find them with an ArchUnitNET slice rule run once as a probe (a scratch test in a test project with the package; `Architecture` is built as in the enforcement example below):

```csharp
Slices().Matching("MyApp.(*)").Should().BeFreeOfCycles().Check(Architecture);
```

The failure lists every cycle between the slices. Adjust the pattern to the level that matches the modules (`MyApp.(*)` is one namespace level under `MyApp`; `(**)` matches nested levels).

**Deep reaches**: record caller, target, and the file and line for each of these:

- A project reference to a module's implementation project where a contract project exists (`Orders` references `Billing.Infrastructure` instead of `Billing.Contracts`).
- A **transitive reach**: SDK-style project references flow transitively, so a project can use types from a project it never references. Set `<DisableTransitiveProjectReferences>true</DisableTransitiveProjectReferences>` in the caller's `.csproj` for one build, so only that project changes; every new compile error in it is a use of a project reached only transitively. Revert it afterwards unless the user chooses it as the fix.
- `using` directives or fully qualified names that name another module's internal namespaces (`*.Internal`, `*.Infrastructure`, `*.Persistence`, or whatever the module's internals are called): search the source.
- `InternalsVisibleTo`, in `.csproj` items (`<InternalsVisibleTo Include="..."/>`) and `[assembly: InternalsVisibleTo(...)]` attributes: each grant to an assembly other than the module's own tests is a reach past the interface.

**Fan-in and fan-out**, per project from the graph; report the table sorted by the sum.

Done when the graph, the cycle result (project and namespace level), the deep-reach list, and the fan-in/fan-out table are all written down, each with the command or rule that produced it.

## Enforce a boundary

The mechanisms, strongest first:

1. **The compiler, by access.** Internals are `internal`; the interface is `public`. Grant `InternalsVisibleTo` only to the module's own test project. A caller outside then can't compile against the internals at all.
2. **The compiler, by reference.** Callers reference only the contract project. To stop them reaching the implementation transitively, set `DisableTransitiveProjectReferences` to `true` in the callers (they then list every project they use directly), or have the host alone reference the implementation.
3. **An architecture test**, for rules the compiler can't express: namespace rules inside one project, "only the host references infrastructure", no cycles. Put it in a test project so `dotnet test`, and so the existing CI, runs it. ArchUnitNET (`TngTech.ArchUnitNET` plus the adapter for the test framework, such as `TngTech.ArchUnitNET.xUnit`) covers dependency and cycle rules and is actively released; NetArchTest (`NetArchTest.Rules`) covers dependency rules but hasn't been released since 2021, and its fork `NetArchTest.eNhancedEdition` adds slices. Keep whichever the project already uses.

   ```csharp
   using static ArchUnitNET.Fluent.ArchRuleDefinition;   // Types()
   using ArchUnitNET.xUnit;                              // .Check(Architecture)

   private static readonly Architecture Architecture =
       new ArchLoader().LoadAssemblies(typeof(OrderService).Assembly, typeof(Invoice).Assembly).Build();

   [Fact]
   public void Orders_does_not_reach_billing_internals() =>
       Types().That().ResideInNamespaceMatching(@"^MyApp\.Orders(\..+)?$")
           .Should().NotDependOnAny(Types().That().ResideInNamespaceMatching(@"^MyApp\.Billing\.Internal(\..+)?$"))
           .Check(Architecture);
   ```

   ArchUnitNET's `ResideInNamespace("X")` matches namespace `X` exactly, not `X.Sub`; use `ResideInNamespaceMatching` with a regex to cover a module's sub-namespaces. The slice probe from measuring (`Slices()` from `ArchUnitNET.Fluent.Slices.SliceRuleDefinition`) becomes a permanent no-cycles test the same way.

4. **A banned-API analyzer**, when a namespace or type must never be used from a set of projects: `Microsoft.CodeAnalysis.BannedApiAnalyzers` with a `BannedSymbols.txt` added as `AdditionalFiles`, one documentation ID per line (`N:MyApp.Billing.Internal` bans a namespace). Violations are RS0030 build diagnostics, errors under warnings-as-errors.

**Existing violations**: follow `gates`' red-baseline step (measure, show the count, ask). The .NET ratchet: turn the rule on for the projects or namespaces already clean, each one left out a ratchet entry, or turn RS0030 into an error project by project. Never add `NoWarn`, `#pragma warning disable`, or an exclusion in the architecture test to get green.

## Violations to plant

A `using` of the forbidden namespace plus a use of one of its types in the caller, a `ProjectReference` to the forbidden project, or an internal type called from outside. The failure names it as a compile error, RS0030, or the architecture test's failing type.

Why a rule stayed green, in .NET: architecture rules fail open quietly, through a namespace filter that matches no types (or only the top namespace), an `ArchLoader` that didn't load the assembly, or a severity left below error.

## Document the boundary

Next to the code: the module's `README.md`, or a comment at the top of the architecture test. The `CONSTRAINTS.md` row's command is `dotnet test`.
