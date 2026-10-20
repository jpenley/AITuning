# Module boundaries

Read [Shared gate safeguards](COMMON.md) first. This is Part 2 of the gates procedure.


Make a boundary between modules mechanical, so a violation fails a check instead of relying on someone remembering the rule. The vocabulary is the `modules` skill's (**module**, **interface**, **seam**, **depth**): load it with your skill tool if it isn't already in context. The `seams-<stack>` skill says what a module, an interface, and a deep reach are in that stack, and supplies the tools.

### 1. Map the modules

List the modules at the scale that matters (packages, projects, crates, or folders inside one), each one's interface (its entry points), and what the repo already uses for boundaries: an import or dependency rules file, architecture tests, a build tool's tags. Existing rules are the first thing to run and the place new rules go.

Done when every module in scope, its interface, and every existing rule are listed.

### 2. Measure the edges

Measure with a tool, never by reading imports by eye: the graph must include every module, not the ones you happened to open. Without a `seams-<stack>` skill, use the dependency tool the project has, or ask the user which one to use; if you must read imports by hand, the report says the graph is partial. Anything the tool can't resolve (an alias, a macro, a missing file) is a blind spot: fix the tool's config or list it before trusting the numbers.

Produce, each with the command that produced it:

- **The module graph**, collapsed to one node per module.
- **Cycles**, each as its chain with the file and line of every link.
- **Deep reaches**: each caller, the import, the file and line, and the interface it should go through instead.
- **Fan-in and fan-out** per module: how many modules use it, and how many it uses.

Read the numbers as signals: high fan-in is an interface many callers depend on, so changes there ripple, and it is the one most worth protecting; high fan-out is a module that knows too much; high on both is a hub. A deep reach says the interface is missing something its callers need, or the caller is reaching for an implementation detail.

Done when every module has fan-in and fan-out, and every cycle and deep reach is listed with its file and line.

### 3. Decide the boundary

A rule encodes a decision, so make the decision first, with the user:

- **Direction**: which module may use which. A cycle is a design question (which side owns the shared concept, or what moves behind a seam): load the `modules` skill with your skill tool and settle it before writing a rule that forbids one side.
- **Interface**: what each protected module exposes. Everything callers reach past it today either becomes a deliberate part of the interface or stops being used.

Done when every boundary is one sentence ("`billing` never imports `orders`"; "outside `billing`, use only `billing`'s interface").

### 4. Enforce it

Use the lightest mechanism that makes a violation fail, strongest first, and run it in a command CI already runs, or it guards nothing:

1. **The language itself**: visibility or an export list, so the compiler or runtime refuses a caller past the interface.
2. **The package manifest**: a module in its own package, project, or crate, so the dependencies it declares are the direction rule.
3. **A rule in the checks**: an import or dependency linter, an architecture test, or a banned-API list, at error severity, for what the first two can't express.

Existing violations follow [Existing violations](COMMON.md#existing-violations): fix them first (move each caller onto the interface, or move the code to the side of the boundary it belongs on), or ratchet them. Never widen the rule or exclude the offending files to get green.

Done when each boundary sentence has a rule, and the CI command runs it.

### 5. Prove it bites

Boundary rules fail open quietly: a pattern that matches nothing, an unresolved alias, a file outside the graph, or a loader that missed the code passes every time. For each rule, through the same command CI runs:

1. Run it on the clean tree: it passes.
2. Plant one violation of that rule and nothing else, written the way a caller would: a deep import past the interface (through the package name or alias, not only a relative path), an import in the forbidden direction, or the import that closes a cycle.
3. Run it: it **fails, naming the rule and the planted file**.
4. Revert (commit the rule and the moved callers first, under [Reset safety](COMMON.md#reset-safety)), confirm `git status` shows nothing planted, and run it again: it passes.

A rule that stays green on its plant is a finding, not a boundary: find why (the stack skill lists the usual causes), fix it, and prove it again. Record the rows in the [shared proof table](COMMON.md#proof-table), with the rule as the check; anything you couldn't run is "not run" with the reason, never reported as proven.

### 6. Document the boundary

- **Next to the code** it governs (the module's README, or a comment at the top of its interface file or the rule): what the interface is, what's internal, the allowed direction, and which check enforces it.
- **The instruction file** (`AGENTS.md`): one pointer line naming the rule and its command, so agents find the rule instead of tripping over it.
- **`CONSTRAINTS.md`**, if present: an Enforced row ("Architecture boundaries | zero violations | <the rule's command> | CI"), and an Exceptions row per ratchet entry.

### Report

The measurements (fan-in and fan-out per module, every cycle with its links, every deep reach with file and line), the boundary sentences, the rules added, the files changed, the proof table, and any ratchet entries left with their owner.
