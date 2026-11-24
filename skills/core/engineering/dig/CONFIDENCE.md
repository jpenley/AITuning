# Confidence

The record is incomplete, and a confident guess about why code exists is worse than an honest gap: the user will act on it. Every claim in a `dig` answer sits in exactly one tier, and the tier decides its section and its wording.

## Tiers

| Tier | What qualifies | Wording it allows | Section |
|---|---|---|---|
| **Direct** | A person wrote the reason down: a commit message, PR body, review comment, ticket, doc, chat message, or code comment that says why | Plain and causal ("exists because", "was added to", "the author chose"), with the citation and a verbatim quote beside it | What the record says |
| **Supported** | No single source says it, but two or more independent items converge (a PR titled "perf", a ticket labelled perf, tests added for large inputs) | "The record points to X:" followed by each item and what it adds | What the record says |
| **Inferred** | A reasonable reading that nothing states: timing, a convention seen elsewhere, what a diff changed | Hedged: "appears to", "likely", "suggests", "is consistent with", with the chain written out: "given A and B, C seems likely because D" | What we infer |
| **Speculative** | A plausible story that other stories fit equally well | "One possibility is X; no evidence found for it", plus what would confirm it | What we infer |
| **Unknown** | You searched and found nothing | "Searched <source> with <exact query or command>; found nothing", plus who could know | What we don't know |

Causal words ("because", "the reason is", "was designed to", "fixes", "the team decided") belong to Direct and Supported claims only, each with its citation next to it. Words that assert without evidence ("obviously", "clearly", "of course", "just") belong nowhere.

## What counts as evidence

- **Code is never evidence of its own intent.** The code shows what it does: that it retries on 429 says nothing about why the limit is 5. A name, a pattern, or a shape is an observation about the code; intent comes only from what a person wrote about it. Reading the code to understand what the target *is*, or to check whether it still serves the recorded reason, is fine; citing it as the *why* is not.
- **A diff is mechanics.** A commit that changes `limit = 50` to `limit = 100` shows the change; the reason is in its message, its PR, its ticket, or its review thread, or it is unknown.
- **The user's guess is a candidate.** A hypothesis in the question gets checked against the record like any other and receives its own verdict: held, partly held, not held, or untested. The record decides the verdict, whatever the user expects to hear.
- **Contradictions stay open.** When two sources give different reasons (the ticket says a customer asked for it, the PR says tech-debt cleanup), quote both, say what each would mean, and leave the call to the user. Both may be true (the ticket motivated the work; the PR is the author's framing), or one may be wrong; the tidier story is not evidence.
- **Absence is not evidence of absence.** "Nobody mentioned security" does not mean security wasn't a concern; it goes under *What we don't know*.
- **The latest commit is not the whole story.** Today's shape is often several decisions stacked; a value changed last month may have been introduced for a different reason years ago. Each layer gets its own claim.
- **Copying is not intent.** A pattern repeated across the codebase may be copy-paste; trace it to the commit where it first appeared and read that one.

## Calibration check

The answer is ready to send when each of these holds; fix the claim or move it to the right tier until it does:

1. Every Direct and Supported claim has a citation (commit hash, PR number, ticket ID, URL, or file:line) and, for Direct, a verbatim quote.
2. Every causal word sits in a Direct or Supported claim.
3. No claim cites the code as evidence of why it exists.
4. If the question carried a hypothesis, the answer gives it a verdict with the evidence for and against.
5. Every disagreement between sources appears under *Contradictions* with both sides quoted.
6. *What we don't know* names at least one specific search, or states why the record is complete (rare: historical records almost always have gaps).
7. *Sources consulted* has one line per source category, including the unavailable ones.
