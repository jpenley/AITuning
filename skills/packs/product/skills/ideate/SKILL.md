---
name: ideate
description: Turn a vague or greenfield idea into a sharp, buildable concept by exploring variations first and then converging, ending in a one-pager to take into grill.
disable-model-invocation: true
---

# Ideate

Open an idea up before narrowing it down. `grill` settles the details of a chosen idea; `ideate` comes before it, when the idea itself isn't chosen yet. Three phases, as a conversation rather than a template.

Be honest, not supportive: a sharp thinking partner, not a yes-machine. Push toward the simplest version that solves the real problem, start from the user's experience and work back to technology, and question "how it's usually done".

## 1. Understand and expand

1. **Restate the idea** as a "How might we...?" problem: narrow enough to act on, broad enough to allow different solutions, free of an embedded solution.
2. **Ask 3-5 sharpening questions, one at a time**, no more: who exactly is it for, what does success look like, what are the real constraints (time, technology, resources), what has been tried, why now. Ask the user; don't proceed until you know who it's for and what success looks like. For a new product or tool people must adopt, use the forcing questions in [frameworks.md](frameworks.md) instead: they ask for evidence of demand, not enthusiasm.
3. **Generate 5-8 variations**, each with a reason to exist, using the lenses that fit:
   - **Inversion**: what if we did the opposite?
   - **Constraint removal**: what if budget, time, or technology weren't factors?
   - **Audience shift**: what if it were for a different user?
   - **Combination**: what if it merged with an adjacent idea?
   - **Simplification**: what's the 10x simpler version?
   - **10x version**: what would it look like at massive scale?
   - **Expert lens**: what would a domain expert find obvious?

   In a codebase, ground the variations in what exists: the architecture, patterns, and constraints are both limits and opportunities. More lenses: [frameworks.md](frameworks.md).

## 2. Evaluate and converge

Once the user reacts (what resonates, what doesn't):

1. **Cluster** what resonated into 2-3 meaningfully different directions.
2. **Stress-test each** on **user value**, **feasibility**, and **differentiation**, with the rubric in [refinement-criteria.md](refinement-criteria.md).
3. **Surface hidden assumptions** for each direction: what you're betting is true, what could kill it, what you're choosing to ignore. Most ideation fails here; don't skip it.

## 3. Sharpen

Produce a one-pager:

```markdown
# <Idea name>

## Problem statement
<One-sentence "How might we...?">

## Recommended direction
<The chosen direction and why, in 2-3 short paragraphs>

## Key assumptions to validate
- [ ] <Assumption>: <how to test it; a `sketch` or `research` task where that fits>

## MVP scope
<The smallest version that tests the riskiest assumption: what's in, what's out>

## Not doing (and why)
- <Thing>: <reason>

## Open questions
- <What must be answered before building>
```

Ask whether to save it to `docs/ideas/<idea-name>.md`; save only if the user confirms. Then suggest the user run `grill` on the chosen direction, with the one-pager as its starting point.
