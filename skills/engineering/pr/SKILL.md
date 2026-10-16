---
name: pr
description: Use when writing a pull request body or description, or a summary of changes being merged, including one that reads as AI-generated.
---

# PR

Write the PR body in this shape. Skip preambles, keep prose brief, and use the domain language from `CONTEXT.md`. If the `prose` skill is installed (the writing pack), load it with your skill tool and apply its sentence steps to the body. For a Mermaid diagram, load the `diagram` skill too if it's installed (the diagram pack), so the diagram is checked before it ships.

```markdown
## Summary

<the smallest view that makes the change clear: a diagram, diff sketch, or tree>

## Evidence

- **Before:** <screenshot / output / failing test run>
  **After:** <screenshot / output / passing test run>

## Merge Danger

**Door:** <one-way or two-way>

<optional: why>

**Blast Radius:** <one word>

<optional: what could be affected>

## Rulings

<optional: every `Ruling:` line made during the work, in order, each with its cost if wrong>

## Noticed, not touched

<optional: things worth doing that were deliberately left out of this change, each a candidate ticket>

## Potential concerns

<optional: anything a reviewer should check>

## UNVERIFIED

<optional: version-sensitive API uses that couldn't be checked against official docs>

## Deferred minors

<optional: minor review findings left for later, one line each>
```

## Summary: the smallest view

Pick the one or two views that make the key point clear; don't use them all. Keep only the calls, files, props, states, and boundaries the reader needs, and put each view next to the sentence it supports.

- **Logic or an algorithm**: pseudocode.
  ```text
  on(save)
    if content is unchanged
      return cached result
    write new content
  ```
- **Runtime control flow**: a call tree.
  ```text
  submitForm
    createSession
      persistPrompt
    navigateToSession
  ```
- **UI structure**: a component tree, with the state and module boundaries that matter.
- **A broad refactor**: a shallow file tree with one comment per folder.
- **Interaction or data flow between parts**: a Mermaid sequence or flow diagram.
- **What changed, when the surrounding shape already exists**: a diff shaped like the topic (a call tree, file tree, or state flow with `+`/`-` lines).
  ```diff
   submitForm
     createSession
       persistPrompt
  +    expandSkillMention
  ```
- **Mostly new code**, or a copyable target shape: the whole block.

## Evidence

Show that the change works, before and after. Screenshots are best when the change is visual and the environment can take them. Otherwise, execution output: the exact test that failed before and passes now, or command output. Evidence follows the `evidence` skill: fresh runs only.

## Merge danger

- **Door**: a **two-way** door can be walked back (cheap to roll back); a **one-way** door can't (destructive migrations, deleted data, published contracts, hard-to-reverse decisions).
- **Blast radius**: one word for the scope of impact (for example `local`, `module`, `consumers`, `everyone`), then any ramifications worth naming: layout shift, breakage for consumers, performance, mobile.

## The optional sections

Omit any optional section that would be empty. The `build` skill's final report maps onto them directly.
