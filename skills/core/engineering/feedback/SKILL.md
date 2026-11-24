---
name: feedback
description: Use when working through review comments or findings a reviewer left on a pull request or change (from an audit, a colleague, or the user), before changing any code in response, especially when feedback seems unclear or questionable.
---

# Feedback

Review feedback is a set of technical claims to evaluate, not instructions to obey or opinions to applaud. Verify before implementing, ask before assuming, and put technical correctness ahead of social comfort.

## The response pattern

1. **Read** all of the feedback before acting on any of it.
2. **Restate** each item as a technical requirement in your own words.
3. **Verify** it against the codebase as it is, and decide whether it's sound for *this* codebase (see By source).
4. **Respond** with a technical acknowledgement or reasoned pushback.
5. **Implement** one item at a time, testing each.

## Unclear items block everything

If any item is unclear, ask about it before implementing any of them: items are often related, and partial understanding produces the wrong implementation. "I understand 1, 2, 3 and 6; I need clarification on 4 and 5 before starting."

## By source

- **From the user**: trusted. Implement once you understand it; ask only if the scope is unclear.
- **From a reviewer or external source**, apply the tests in "Pushing back" before implementing, plus: is there a reason for the current code, and does it hold on every platform and version in use? If a suggestion conflicts with a decision the user already made, raise it with the user first.
- **"Implement it properly"** suggestions: grep for actual usage first. If nothing calls it, propose removing it (YAGNI) instead of building it out.

## Pushing back

Push back when a suggestion breaks existing behaviour, lacks context, adds an unused feature, is wrong for this stack, ignores legacy or compatibility constraints, or conflicts with the user's architectural decisions. Use technical reasoning, reference working tests or code, and involve the user when it's architectural. When you can't verify a claim, say so: "I can't verify this without X. Should I investigate, ask, or proceed?"

If you pushed back and were wrong, say so plainly and move on: "Checked: you're right, it does X. Fixing now."

## Acknowledging correct feedback

State the fix, or just show it in the code: "Fixed: `parseDate` now rejects non-ISO input (`dates.ts:41`)." The change itself shows the feedback landed; performative agreement ("You're absolutely right!", "Great catch!") and thanks add nothing.

## Order of work

1. Blocking issues (breakage, security).
2. Simple fixes (typos, imports).
3. Complex fixes (refactors, logic).

After each fix, run its focused regression check and any invalidated checks. For implementation changes, read [Verification cadence](../evidence/CHECKS.md): run the full suite, typecheck and applicable project gates after the last relevant fix, not after every comment. Broaden earlier when impact is uncertain or project policy requires it. Text-only feedback uses the checks appropriate to that artifact. When replying to inline comments on a GitHub PR, reply in the comment thread, not as a top-level comment.
