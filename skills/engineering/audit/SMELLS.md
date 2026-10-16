# Code-smell baseline

The Standards axis carries this baseline in every repo. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something below, suppress the smell.
- **A judgement call unless marked.** Each smell is a labelled heuristic ("possible Feature Envy"), not a hard violation. Skip anything tooling already enforces. The migration smells carry fixed minimum severities.

Each entry: what it is, then the fix.

## Fowler smells (*Refactoring*, chapter 3)

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. Fix: rename it; if no honest name comes, the design is murky.
- **Duplicated Code**: the same logic shape in more than one hunk or file of the change. Fix: extract the shared shape and call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. Fix: move the method onto the data it envies.
- **Data Clumps**: the same few fields or parameters keep travelling together. Fix: bundle them into one type and pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept. Fix: give the concept its own small type.
- **Repeated Switches**: the same `switch` or `if` cascade on the same type recurs across the change. Fix: polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files. Fix: gather what changes together into one module.
- **Divergent Change**: one file or module edited for several unrelated reasons. Fix: split it so each part changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks for needs the spec doesn't have. Fix: delete them and inline until a real need appears.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. Fix: hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly delegates onward. Fix: cut it and call the real target directly.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. Fix: drop the inheritance and use composition.

## Structure

- **Relocated Complexity**: a refactor that moves code around without reducing the number of concepts a reader must hold. Fix: prefer the restructuring that makes whole branches, modes, or layers disappear; delete an abstraction rather than polish it.
- **Leaking Feature Logic**: feature-specific logic placed in a shared or general-purpose module. Fix: move it to the module that owns the concept.
- **Near-duplicate Helper**: a bespoke helper beside an existing canonical one that does the same job. Fix: use the canonical helper.
- **Silent Fallback**: a default, cast, `any`, or catch-all that papers over an unclear invariant. Fix: make the boundary explicit (a type, a validation, a clear failure) so downstream branching disappears.
- **Bolted-on Conditional**: a new condition inserted into an unrelated flow. Fix: give the logic its own helper, state, or policy.
- **Swollen File**: a change that pushes a file past about 1000 lines without decomposing it. Fix: extract helpers or submodules first, then add.
- **Check-then-act Race**: a read followed by a write that assumes nothing changed between them (including "does this idempotency key exist? then insert"). Fix: an atomic operation, such as a unique constraint that picks the winner (see `modules/IDEMPOTENCY.md`).
- **Inconsistent Error Shapes**: one surface that sometimes throws, sometimes returns null, sometimes returns an error object. Fix: one error strategy and shape across the surface.
- **Breaking Contract Change**: a removed field, a changed type, or changed observable behaviour on a public interface. At least **Important**; name it so `release` can version it. Fix: add rather than modify (new optional fields), or a deliberate major version with a migration note.
- **Invisible Failure Path**: a new external call, retry, queue, or background job whose failure can't be observed (no log, metric, or surfaced error). Fix: emit a structured event for the failure path.
- **Mocked-away Subject**: a test that mocks the very behaviour it claims to test (the repository in a repository test, the parser in a parsing test), or asserts only that a mock was called. It passes whatever the code does. Fix: mock only at system boundaries and assert on the result.
- **Unchecked New Value**: a new enum member, status, type tag, or config value added without checking the code that consumes it, which usually lives outside the diff (switches, maps, serializers, UI labels). Fix: search for every consumer and handle the new value, or make the unhandled case fail loudly.

## Comments

- **Commented-out Code**: disabled blocks left in place. Fix: delete them; version control has the history.
- **Narrating Comments**: comments that restate what the code does. Fix: delete them, and keep comments that explain *why* or warn of a gotcha.

## Performance

- **N+1 Queries**: a query per item inside a loop over query results. Fix: one batched or joined query.
- **Unbounded Fetch**: reading a whole table or collection with no paging or limit. Fix: paginate or cap.
- **Index-blind Query**: a filter or sort the database can't serve from an index (a function applied to the column, a leading wildcard, a type mismatch). Fix: rewrite the predicate or add the index.
- **Hot-path Allocation**: large objects built inside a hot loop or per-request path. Fix: hoist, reuse, or stream.

## Migrations

- **Coupled Schema Change**: a schema change shipped in the same deploy as the code that depends on it. At least **Important**. Fix: expand first, deploy, then switch the code.
- **In-place Rename or Drop**: a column or table renamed or dropped directly. At least **Important**; **Critical** when data could be lost. Fix: expand, dual-write, backfill, switch reads, then contract in a later deploy.
- **Irreversible Migration**: a migration with no tested down path. At least **Important**; **Critical** when data could be lost. Fix: write and run the down path before merging.
- **Blocking Backfill**: one unbatched update over a large table. At least **Important**. Fix: backfill in throttled batches, off the hot path.
