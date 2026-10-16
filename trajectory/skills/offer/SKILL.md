---
name: offer
description: Use when the candidate has received a job offer letter or employment contract and wants it read through, compared with what was promised, or prepared for a negotiation or a talk with a lawyer, or is weighing whether to accept.
---

# Offer

Reads an offer the way a careful friend would before it's signed: what it says, what it leaves out, what differs from what was promised, and what to ask. The decision is the candidate's; this skill gives no verdict on signing and no legal advice.

## 1. Before reading

- Confirm you have the whole text (every page, every document it refers to: the invention agreement, the equity plan, the handbook). List what's referred to but missing.
- Ask what was promised before the letter arrived, and by whom, when, and how (phone, email): signing bonus, remote work, title, start date, equity. Those are checked against the letter in step 2.
- In the workspace, save the letter as `applications/<folder>/offer.md` and record it with the `track` skill's script (`<this skill's folder>/../track/scripts/tracker.mjs set <id> --status offer --note "<date received>"`).

## 2. Clause by clause

For each clause, quote the letter's own words, then say in plain terms what it means for the candidate. Tag each one with one of: **clear**, **worth asking about**, **for a lawyer**.

- **Money**: base, bonus (guaranteed or "discretionary"), equity (number, vesting, cliff, and every condition such as "subject to Board approval"; the strike price and share count outstanding if they're given, or ask for them), benefits.
- **Promises vs the letter**: each promise from step 1 either appears in the letter or doesn't. A missing promise, together with an "entire agreement" clause that supersedes oral statements, goes at the top of the report.
- **Restrictions**: non-compete, non-solicit, invention assignment (note especially whether it reaches work done outside hours or without company resources), confidentiality, clawbacks and repayments.
- **Terms**: at-will or notice, location and arrangement, start date, deadline.

## 3. Law and numbers

Whether a clause is enforceable, and what the law requires, depends on where the candidate lives and works and changes over time: each such point is a **question for an employment lawyer**, written as the question to ask, never settled from memory. A market salary figure appears only with its source and date (a named survey, the company's own posted range); otherwise leave it out and suggest where to look.

## 4. Report

```markdown
**Top of the list:** <promises missing from the letter, and anything unusual enough to raise before the deadline>

**Clause by clause:**
| Clause | What it says (quoted) | What it means for you | Tag |
|---|---|---|---|

**Ask the recruiter:** <each ask, written so it can be sent: "Could you add the $15,000 signing bonus to the letter?">

**Ask a lawyer:** <each question, specific to the clause and the candidate's location>

**Missing documents:** <what the letter refers to that you haven't seen>

**Your decision:** <the few things that decide it for you, based on what you've said matters; no recommendation to sign or not>
```

**Done when** every clause has its quote, meaning, and tag; every promise is checked against the letter; every legal point is a question, not a conclusion; and the report contains no sign or don't-sign recommendation.
