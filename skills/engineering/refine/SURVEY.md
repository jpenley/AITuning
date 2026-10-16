# Survey mode

`refine survey` (whole codebase, weighted to hot spots) or `refine <area>` (one module, subsystem, or pain point). Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones, for testability and agent-navigability. This is a survey, not a rescue: it finds and ranks the candidates.

Load the `modules` skill with your skill tool for the vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter is a hypothetical seam, two make a real one"). Use those terms exactly in every suggestion. The domain language in `CONTEXT.md` names good seams; ADRs in `docs/adr/` record decisions not to relitigate.

## 1. Explore

**Scope first.** Deepening pays off where future changes land, so weight recent change:

- If the user named an area (a module, subsystem, or pain point), start there.
- Otherwise read a good stretch of `git log` to find the **hot spots**: the files and areas that keep changing. Widen the net only if changes are scattered.

**Measure the edges.** Detect the stack (for example `*.sln` / `*.csproj`, `package.json` / `tsconfig.json`) and load the matching `seams-<stack>` skill with your skill tool if one is installed; it says which tooling to use. Use that tooling to find:

- the module and import graph
- **cycles**
- **deep imports**: callers reaching past a module's entry points into its internals
- **fan-in and fan-out**: what depends on each module, and what it depends on

With no `seams-<stack>` skill, read imports directly and ask the user what dependency tooling the project has. A hot spot that sits in a cycle and is imported past its interface is a strong candidate.

**Then read for friction.** Read `CONTEXT.md` and the ADRs in the area, then have a sub-agent walk the candidate areas (or walk them yourself) and note where understanding hurts:

- One concept requires bouncing between many small modules.
- A module is **shallow**: its interface is nearly as complex as its implementation.
- Pure functions were extracted for testability, but the real bugs hide in how they're called (no **locality**).
- Tightly coupled modules leak across their seams.
- Code is untested, or hard to test through its current interface.

Apply the **deletion test** to anything that looks shallow: would deleting it concentrate complexity, or just move it? "Concentrates" is the signal.

## 2. Present the candidates as an HTML report

Write one self-contained HTML file to the OS temp directory (`$TMPDIR`, falling back to `/tmp`, or `%TEMP%` on Windows) as `architecture-review-<timestamp>.html`, so nothing lands in the repo. Open it (`start` on Windows, `open` on macOS, `xdg-open` on Linux) and give the absolute path. Keep it local: it describes the codebase.

Each candidate gets a card and the report ends with a **Top recommendation**; benefits are stated in locality and leverage terms, including how tests improve. Card fields, strength badges, diagram patterns, and tone: [HTML-REPORT.md](HTML-REPORT.md).

**ADR conflicts**: surface a candidate that contradicts an ADR only when the friction is real enough to reopen it, and mark it ("contradicts ADR-0007, but worth reopening because...").

Propose no interfaces yet. Ask: "Which of these would you like to explore?"

## 3. Grill the chosen candidate

Load the `grill` skill with your skill tool and walk the decision tree with the user: constraints, dependencies, the shape of the deepened module, what sits behind the seam, which tests survive.

- Alternative interfaces worth exploring: use the design-it-twice pattern from the `modules` skill.

The agreed deepening goes into the main flow from here: suggest the user run `spec` for it.

## 4. Enforce the boundary

Once a deepening is built, offer to make its boundary **mechanical** instead of a rule someone has to remember. Load the `gates` skill with your skill tool and follow its Part 2 from "Decide the boundary": the deepening already settled the direction and the interface, so write them as its boundary sentence. `gates` loads the `seams-<stack>` skill for the tooling when one is installed; otherwise use what the user named.
