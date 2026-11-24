---
name: discover
description: Research what to build next for a product's users before any idea is chosen - customer problems, competitor gaps, market trends, UX, and revenue - and rank the findings into candidates for ideate.
disable-model-invocation: true
---

# Discover

Find what's worth building for a product's users, from evidence, before `ideate` explores any one idea. Adapted from uditgoenka/autoresearch's `improve` command (MIT). The output is a ranked list of problems with their evidence, never a spec: specs come from `ideate`, `grill`, and `spec`.

## 1. Frame

Settle, asking one question at a time:

- **The product area**: what part of the product this is about.
- **Who it's for**: the users or buyers whose problems count. Findings that don't serve them are dropped in step 3.
- **What's known**: pain points the user already hears, and the competitors or workarounds users compare against.

Read the product's own context first, so the questions aren't ones the repository answers: `README.md`, `CONTEXT.md`, the dependency manifest's description, and any existing research notes.

**Done when** the area, the audience, and what's known are written at the top of the log (step 2).

## 2. Research, breadth first

Keep a **log** at `.scratch/discover/<date>-<area>/insights.md`. Research through the `research` skill's quick lookups (load it with your skill tool), with one change for this skill: what customers and competitors say about themselves is primary evidence here. That means a competitor's own pages, pricing, and changelog; app-store and marketplace reviews; public issue trackers and forums where users describe problems. Analyst blogs and roundups are secondary: use them to find primary sources, not as evidence.

The first five rounds cover one category each, so no category is skipped:

1. **Customer problems**: pains, unmet needs, the jobs users hire the product for.
2. **Competitor gaps**: what alternatives do badly or don't do, and what users complain about in them.
3. **Market trends**: timing, shifts in behaviour, rules or standards that change what's possible.
4. **Experience**: onboarding, friction, where users give up.
5. **Revenue and growth**: pricing, what users pay for, what makes them stay or leave.

After that, spend rounds on the categories with the richest findings.

**Each finding** goes in the log as one row:

| Problem (10 words or fewer) | Who has it | Mechanism (how it could be addressed) | Expected outcome | Sources | Confidence | Status |
|---|---|---|---|---|---|---|

- **Confidence** comes from independent sources: 3 or more is high, 2 is medium, 1 is low. Two pages quoting the same survey are one source.
- **Status** against the rows already logged: **new** (a problem and audience not seen yet), **extension** (the same problem and audience, a different mechanism: add it to that row), or **duplicate** (the same problem, audience, and mechanism: add the source to that row, don't add a row).

**The user's own data.** When the user brings interview notes, support tickets, survey or NPS responses, log them before any web round, one participant (or ticket) as one source. Each row's Sources says "X of N participants" and quotes one or two of them by ID (P3, ticket #412). Keep what people did (a workaround, what they showed on screen, a usage figure) apart from what they say they want, and when the two disagree, the row follows what they did and names the contradiction. A row resting on 2 or fewer participants is a **hypothesis**: label it so in Confidence; it ranks as a moonshot at most.

**Stop** when three rounds in a row after the first five each add fewer than two new rows, or the user's budget runs out.

**Done when** every category has at least one round, every row has its sources and confidence, and the log says why research stopped.

## 3. Check the audience

Drop each row whose problem the audience from step 1 doesn't have, and list what was dropped at the end of the log with the reason.

## 4. Rank

Sort the remaining rows into **must-have** (a painful, frequent problem for the audience, with medium or high confidence), **nice-to-have**, and **moonshot** (big if true, weakly evidenced). Rank the must-haves against each other in pairs: which of these two would the audience pay for or switch for first? Keep at most ten.

Give each ranked item two sentences: why it ranks there, citing its evidence, and what would change its rank.

**Done when** every remaining row has a tier, and the must-haves are in order with their reasons.

## 5. Hand off

Show the ranked list and ask which items to take forward. Each chosen item goes to `ideate` as its starting problem: its problem, audience, and evidence, which answer most of `ideate`'s sharpening questions. `ideate` is user-invoked, so suggest the user run it for each item.
