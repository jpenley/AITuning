# ADR format

**Match the existing convention first.** If the repo already records decisions (existing ADRs in any folder, an `.adr-dir` file, `adr-tools`, MADR, reStructuredText), follow its location, format, numbering, and headings, and continue its sequence. If the evidence conflicts (two schemes in use), ask rather than adding a third. The defaults below apply only when no convention exists.

By default, ADRs live in `docs/adr/`, numbered sequentially: `0001-slug.md`, `0002-slug.md`. Scan for the highest number and add one.

```md
# {Short title of the decision}

{1-3 sentences: the context, what we decided, and why.}
```

A single paragraph is a complete ADR. The value is recording *that* a decision was made and *why*.

Add these only when they carry real information:

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`), for decisions that get revisited
- **Considered options**, when the rejected alternatives are worth remembering
- **Consequences**, when downstream effects are non-obvious

**Never delete an ADR.** When a decision changes, write a new ADR that references the old one, and mark the old one `superseded by ADR-NNNN`; the history of why is the point.

## When to offer one

The decision must pass all three tests in SKILL.md (hard to reverse, surprising without context, a real trade-off). What typically qualifies:

- **Architectural shape.** "The write model is event-sourced; the read model is projected into Postgres."
- **Integration between contexts.** "Ordering and Billing talk through domain events, not synchronous HTTP."
- **Technology with lock-in.** Database, message bus, auth provider, deployment target; the choices that would take a quarter to swap.
- **Boundary and scope.** "Customer data is owned by the Customer context; others reference it by ID." Explicit no's count as much as yes's.
- **Deliberate deviations from the obvious path.** "Manual SQL instead of an ORM because X." These stop the next engineer "fixing" something deliberate.
- **Constraints invisible in the code.** Compliance, contractual latency limits.
- **Non-obvious rejections.** If GraphQL lost to REST for subtle reasons, record it, or someone proposes GraphQL again in six months.
