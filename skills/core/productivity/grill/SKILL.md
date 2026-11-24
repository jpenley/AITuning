---
name: grill
description: Use when the user wants a plan, design, decision, or idea stress-tested before work starts, or says "grill".
---

# Grill

Interview the user relentlessly until you reach a shared understanding. Map it as a **design tree**: every decision branches into the decisions that hang off it.

**In a repo**, also load the `domain` skill with your skill tool and run it alongside the interview, so terms resolved and hard decisions made land in `CONTEXT.md` and ADRs as they happen. With no repo under the conversation, the interview alone is the whole skill.

## Your hypothesis

Open your first reply with these two lines, labels included, before any risks, context, or questions: what you think the user wants, and an honest confidence percentage. Below about 70%, say what's missing:

```
HYPOTHESIS: a personal tracker for which experiments are running, not a team dashboard.
CONFIDENCE: ~40%: missing who it's for and what "early signal" means.
```

Then ask the first question.

## One question at a time

The **frontier** is every decision whose prerequisites are settled: the questions you can ask now without guessing at answers you haven't heard. Ask **one question per turn**, the frontier question whose answer reshapes the most of the tree, then stop and wait for the answer. Each answer can settle, reshape, or retire the rest of the frontier: recompute it, then ask the next one.

Ask with your harness's structured question tool when it has one (a tool that shows the user a question with options to pick from, such as `AskUserQuestion` in Claude Code), one question per call:

- **The question** carries the context the user needs to decide, in a sentence or two.
- **2 to 4 options**, each a concrete answer with a one-line description of its consequence. The user can always type their own answer, so there's no "Other" option.
- **Your recommendation is the first option**, its label ending "(Recommended)", and its description says what evidence would change it.

When you have no such tool to call, write the question as plain text in this shape, ending the message on it:

```
<the question, with the context needed to decide>

- **<option>**: <its consequence>
- **<option>**: <its consequence>

➡️ <your recommendation>, unless <what would change it>.
```

**Take a position.** Every question carries a recommendation, including when you're unsure: give your best guess and say why you're unsure. "Unless finance reconciles against the ledger, not the CSV" is the kind of condition a recommendation names. Agreeing with everything, or praising an answer instead of weighing it, is not a recommendation.

**Scope additions are their own question.** When the user, or you, proposes something beyond the original ask, ask it with the options **Add** it now, **Defer** it (it goes to the spec's Out of Scope), or **Skip** it. Never fold an addition in silently, however cheap it looks.

**Want versus should-want.** When an answer sounds like best practice or convention rather than a preference ("it should be scalable", "the standard approach", "I should probably..."), ask: "If you didn't have to justify this to anyone, what would you actually want?"

## Facts are yours, decisions are theirs

When a frontier question needs a fact from the environment (the code, files, tools, docs), find it yourself, dispatching a sub-agent when the search is broad. Why existing code is the way it is, is such a fact: when the plan removes or changes code whose reason nobody has stated (a sleep, a retry, a special case), load the `dig` skill with your skill tool and find the reason before you ask about that change. Keep asking other frontier questions while it runs: only the questions downstream of that fact wait for it. Put every *decision* to the user and wait for their answer.

When a question can't be settled in conversation and needs a runnable answer (does this state model hold up, what should this look like), say so and suggest the `sketch` skill (the product pack) if it's installed; bring its verdict back into the interview.

## Assumptions mode

When the code can answer most of the questions (an existing codebase, a change inside familiar territory), offer to flip the interview: read the 5-15 most relevant files, then propose your assumptions instead of asking, each graded **Confident**, **Likely**, or **Unclear** and each citing the file that grounds it. The user confirms or corrects them in one pass; then ask the Unclear ones and anything they correct, one at a time. It saves the user answering what the code already says. It doesn't replace the interview for decisions: a preference or a trade-off is still asked, never assumed.

## Done

The interview is done when the frontier is empty (every branch visited, nothing silently assumed) **and** you can predict the user's reaction to the next three questions you would ask. Then restate the understanding for confirmation:

```
- Outcome:      <one line>
- User:         <who benefits>
- Why now:      <what changed>
- Success:      <how we'll know it worked>
- Constraint:   <the binding limit>
- Out of scope: <what we're explicitly not doing>

Yes, no, or refine?
```

Only an explicit yes counts. "Whatever you think is best" is delegation: re-ask with two concrete options. "Sounds good" and "sure, let's go" get "anything you'd refine?". Fold corrections in and restate. Act on the result only after that yes.
