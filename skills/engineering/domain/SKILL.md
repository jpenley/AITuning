---
name: domain
description: Use when the project's glossary or terms are being defined, made consistent, or changed, when editing CONTEXT.md, or when a hard-to-reverse decision should be recorded as an ADR.
---

# Domain

Build and sharpen the project's domain model while you design: challenge terms, invent edge-case scenarios, and write the glossary and decisions down the moment they crystallise. Reading `CONTEXT.md` for vocabulary is a habit any skill can have; this skill is for when the model is *changing*.

## Where things live

Most repos have one context: `CONTEXT.md` at the root and ADRs in `docs/adr/`. If a `CONTEXT-MAP.md` exists at the root, the repo has several contexts; the map points to each context's own `CONTEXT.md` and `docs/adr/`, with system-wide decisions in the root `docs/adr/`. Infer which context the topic belongs to; ask only if it's unclear.

Persist domain records within the user's requested scope. A direct request to create or update a glossary or ADR authorizes that write. When discussion only resolves terminology, show the proposed path and entry before asking to save it; reading vocabulary or another skill loading this one does not authorize unrelated domain-document edits.

Create files lazily: `CONTEXT.md` when the first term is resolved, `docs/adr/` when the first ADR is needed.

## During the session

- **Challenge against the glossary.** When a term conflicts with `CONTEXT.md`, say so at once: "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"
- **Sharpen fuzzy language.** For a vague or overloaded term, propose one precise canonical term: "By 'account', do you mean the Customer or the User?"
- **Stress-test with scenarios.** Invent concrete edge cases that force the boundaries between concepts to be stated precisely.
- **Cross-reference the code.** When the user states how something works, check the code agrees; surface contradictions: "Your code cancels whole Orders, but you said partial cancellation is possible. Which is right?"
- **Update `CONTEXT.md` inline**, as each term resolves, in the format in [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md). `CONTEXT.md` is a glossary and only a glossary: domain terms, no implementation detail, no spec, no scratch notes.
- **Offer an ADR sparingly**, only when the decision is hard to reverse, surprising without context, and the result of a real trade-off. All three, or skip it. Format and examples in [ADR-FORMAT.md](ADR-FORMAT.md).
