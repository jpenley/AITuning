---
name: refine
description: "Use when code works but is harder to read or change than it should be: after an audit leaves smells or deferred minors, before integrating a branch, or when asked to survey the codebase for shallow modules and deepening opportunities."
---

# Refine

Change how code is expressed without changing what it does. Two modes:

- **`refine`** (no argument): local cleanup of **this branch's changes** since its base. Quick and mostly autonomous. Below.
- **`refine survey`** or **`refine <area>`**: a structural survey for **deepening opportunities**, with a visual report ([HTML-REPORT.md](HTML-REPORT.md)) and a grilling session on the one the user picks. Read [SURVEY.md](SURVEY.md).

## Protected blocks

Code between `refine-ignore-start: <reason>` and `refine-ignore-end` markers (any comment style), and between existing `simplify-ignore-start` / `simplify-ignore-end` markers, is off-limits in both modes. Read it for context; never change it; report "protected block skipped: <reason>". Code that looks deliberately unusual but carries no marker (an unrolled loop, a workaround, constant-time comparison) is a Chesterton's fence: ask, or list it under "Noticed, not touched", rather than simplifying it.

## Local mode

### 1. Scope and to-do list

The scope is the diff between the branch and its base. Start the to-do list from the latest `audit` report's Standards findings, smells, and Deferred minors, if there is one; add what you find in step 3. Code outside the diff stays out of scope: list it under "Noticed, not touched".

### 2. Understand before touching

For each piece of code on the list: what is its responsibility, what calls it and what does it call, what are its edge cases and error paths, which tests define its behaviour, and why might it have been written this way (`git blame` and the commit message help). If you can't answer these, read more before changing anything.

### 3. Look for these signals

| Area | Signal | Move |
|---|---|---|
| Structure | Nesting three or more levels deep | Guard clauses, or extract the condition into a named predicate |
| | A long function doing several jobs | Split into focused, well-named functions |
| | Nested ternaries | If/else chain, switch, or lookup table |
| | Boolean flag parameters (`doThing(true, false)`) | An options object, or separate functions |
| | The same conditional in several places | One well-named predicate |
| Names | Generic (`data`, `result`, `temp`), abbreviated, or misleading (a `get` that mutates) | Rename to what it holds or does, in `CONTEXT.md` terms |
| | Comments restating the code | Delete; keep comments that explain *why* |
| Redundancy | Duplicated logic | Extract the shared shape |
| | Dead code, unused variables, commented-out blocks the branch introduced (or made unused) | Remove, once confirmed unused: first try to find a caller or use that proves it isn't dead, including reflection, config, and other entry points, and keep it when unsure. Dead code that predates the branch goes on "Noticed, not touched" |
| | A wrapper that adds nothing | Call the target directly |
| | A factory for a factory, a strategy with one strategy | The simple direct form |
| | Redundant casts or assertions | Remove |

### 4. Apply one change at a time

1. Make one simplification.
2. Run the tests. **Existing tests must pass without modification**: needing to change a test means behaviour changed, so revert.
3. Keep it only if the code is genuinely clearer. Not clearer, or merely shorter: revert.
4. Commit it on its own. Refinement commits never mix with behaviour changes; a large refinement is its own PR.

**Stop signals**: if you revert more than one change in a row, or a simplification starts pulling in files outside the branch's diff, stop and report what you have: the code is telling you the cleanup is bigger than local mode.

Beyond about 500 lines of mechanical change, use automation (a codemod, an AST transform, a scripted rename) instead of hand edits.

### 5. Principles

- **Preserve behaviour exactly**: the same outputs, errors, side effects, and ordering for every input.
- **Follow the project's conventions**; consistency beats personal preference.
- **Clarity over cleverness**: explicit code beats compact code that needs a pause to parse.
- **Balance**: don't inline a helper that named a concept, merge unrelated logic, or chase line count.

Anything bigger than local cleanup (moving responsibilities between modules, changing an interface) is a survey-mode question: suggest `refine survey` on that area.

### 6. Report

List each change with its commit, the protected blocks skipped, anything reverted and why, and "Noticed, not touched". Tag each change and each noticed item, one line apiece: `<file>:L<line>: <tag> <what>. <replacement>.`, with one of these tags:

- `delete`: dead code or unused flexibility; nothing replaces it.
- `stdlib`: hand-rolled code the standard library ships; name the function.
- `native`: code or a dependency doing what the platform does; name the feature.
- `yagni`: an abstraction with one implementation, config nobody sets, a layer with one caller.
- `shrink`: the same logic in fewer lines.

End with `net: -<N> lines`. Then suggest the user run `integrate` if they came from there.
