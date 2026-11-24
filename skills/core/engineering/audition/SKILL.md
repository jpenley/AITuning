---
name: audition
description: Use when a choice will be expensive to reverse and one attempt would lock in its first shape (an interface, a data or wire format, a schema, an algorithm, wording that ships), or when the user asks for several agents to each try the same thing and keep the best, or to throw it in the arena.
---

# Audition

Several **candidates** attempt the same brief independently, in parallel. Then you pick one as the **base** and **graft** the best of the others into it by hand. One attempt locks in its first shape; independent attempts show the shapes you'd never have compared.

It costs about N+1 agents' worth of tokens. If the user didn't ask for several attempts, name the cost and get their yes before fanning out.

## 1. Frame

Write these down before dispatching anything:

- **Artifact**: what each candidate produces, in one sentence, and where it stops (the interface and its rationale, not the implementation behind it).
- **Brief**: one text, identical for every candidate. The problem, the constraints, pointers to the grounding (paths to requirements, the code it touches), the artifact, its output location, and what to return: the artifact plus a short rationale naming the alternatives it considered and why it rejected them. Write it as the user would ask for the work: nothing in it, output paths included, mentions the rubric, the judge, or other candidates.
- **Rubric**: 3-6 criteria for *this* artifact, each gradeable from the artifact alone ("a crash between lease and release can't lose an attempt count", not "robust"). The candidates never see it.
- **N**: the user's number, otherwise 3.
- **Models**: for the candidates, spread across the levels in `docs/agents/model-ladder.md`, or across model families where your harness can run more than one. Different models reach different shapes; the same model N times gives you N variations of one shape. For the judge, a model other than yours (yours only if the harness offers no other).
- **Output locations**: one per candidate, sharing no state: its own worktree when the artifact is code in the repo, otherwise its own folder.

Same brief, not different directions: giving each candidate an assigned approach limits the search to the approaches you already had in mind. (To force whole-shape alternatives of a module interface on purpose, the design-it-twice guide in the `modules` skill gives each attempt a different constraint.)

**Done when** all six are written down.

## 2. Fan out

Dispatch every candidate at once with the same brief, in the background where the harness supports it.

A candidate that crashes, times out, or returns no artifact is a **dropout**: note it and continue with the rest. With one candidate left there is nothing to compare: say so and rerun or stop.

**No sub-agents?** Say so, and offer the user two options: run the brief in N fresh sessions themselves (on different models where they can) and paste the results back, or accept attempts written one after another in this context, labelled **degraded**. Each later attempt has read the earlier ones and drifts toward the first shape, so the spread is narrower than independent attempts give.

**Done when** every candidate has returned or dropped out.

## 3. Judge

Once every candidate has finished (never while any is still working), run two reads side by side:

- **The judge**: one read-only sub-agent on the judge's model from step 1, briefed with [JUDGE.md](JUDGE.md). Give it the brief, the rubric, and the candidates relabelled A, B, C in an order unrelated to dispatch order, with model names and anything else that identifies who wrote each one removed.
- **You**: read every candidate end to end and score each criterion yourself, before reading the judge's verdict.

**Done when** you have both score sheets: every candidate, every criterion.

## 4. Pick the base

- **You and the judge agree on the base**: it's confirmed.
- **You disagree**: one of you is biased or a criterion is ambiguous. Read both rationales on the criteria where you differ, sharpen the ambiguous criterion if that's the cause, and decide.

The base is chosen by the criterion in [JUDGE.md](JUDGE.md) item 3: the candidate a future maintainer can extend without breaking its invariants, and on a tie the one with the smaller interface.

## 5. Graft

Take the first case that fits:

1. **Converged**: the candidates reached the same shape. That agreement is the signal: ship the consensus shape with no graft.
2. **Diverged**: the candidates solved different problems, each answering a question the brief left open in its own way. The brief was under-specified. Name the open question, settle it (with the user if the answer is theirs), rewrite the brief, and rerun. Merging answers to different questions produces an artifact that fits none of them.
3. **Otherwise**: walk each losing candidate once more for the one or two things worth taking, and fold each into the base by hand, rewritten in the base's own terms, so the result keeps one mental model: one way to do each thing.

## 6. Verify

Load the `evidence` skill with your skill tool and verify the result to the same bar as any other output. A problem the audition didn't catch means the frame was wrong (reframe and rerun) or a candidate caught it and the graft was missed (back to step 5).

## Output

The artifact, and beside it a synthesis note:

```markdown
## Synthesis

Rubric: <the criteria>
Base: <label> — <why, by the rubric>
Grafts: <what> — from <label> — <how it was folded in>   (or: none, converged)
Rejected: <what> — from <label> — <why>
Dropouts: <label and cause, or none>
Judge: <its recommended base; agreed or not, and how a disagreement was settled>
Verification: <the check run and its result>
```
