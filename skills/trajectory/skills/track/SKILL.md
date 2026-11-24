---
name: track
description: Use when asked to record that an application was sent or an offer accepted, updating its status in the tracker after a recruiter's reply, rejection, interview, or offer, drafting a follow-up to a recruiter, finding applications that have gone quiet, or checking how the search is going.
---

# Track

Keeps the tracker (`tracker.md` in the workspace) true and drafts what the user sends. The script does the reading, writing, and counting; you decide what to record and write the drafts.

Run everything in the workspace (find `trajectory.md` in the current folder or a parent), with this skill's folder as `<skill>`. Statuses: `evaluated`, `skipped`, `applied`, `screening`, `interviewing`, `offer`, `accepted`, `declined`, `rejected`, `withdrawn`, `no-response`.

## Record a change

```
node <skill>/scripts/tracker.mjs list [--status applied,screening]
node <skill>/scripts/tracker.mjs set <id> --status <status> [--next "<yyyy-mm-dd> <action>"] [--note "<text>"]
```

When the change comes from an email or message the user shows you, propose it with the line that shows it ("rejected: 'we've decided to move forward with other candidates'") and set it once they agree. Never set `accepted` or `declined`: those are the user's decisions, recorded when they tell you.

## Follow up

```
node <skill>/scripts/tracker.mjs stale --days 10
```

For each stale application the user wants to chase, write `followup-<n>.md` in its application folder: short, to the person they applied through, restating fit only with what the submitted CV and cover letter already say. At most two follow-ups per application; after the second, suggest setting `no-response`. You draft; the user sends. Record the send with `--next` for the date to look again.

## How the search is going

```
node <skill>/scripts/tracker.mjs stats
```

It counts applications by status and, per fit verdict, how many got a response (screening or further). Rates on fewer than 5 resolved applications are withheld; report them as "too few to tell", not as a trend. When the rates contradict the verdicts (maybes answered more than applies), say so and suggest the user look again at what `evaluate` weighs, with the evidence.

**Done when** the tracker reflects every change the user confirmed, and each drafted follow-up is saved and its next date set.
