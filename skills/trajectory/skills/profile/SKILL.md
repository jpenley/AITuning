---
name: profile
description: Use when starting a search for a new role or its workspace, turning a CV, résumé, or LinkedIn export into the candidate's fact file, recording something new the candidate did, or changing their target roles, locations, work authorisation, languages, or salary floor.
---

# Profile

A job search runs out of one **workspace**: a folder the user chooses, marked by `trajectory.md` at its root. The **fact file** (`facts.md`) is its core: every claim an application makes about the candidate traces to a line in it, and each line carries its source. The other trajectory skills read both files.

## 1. Find or create the workspace

Look for `trajectory.md` in the current folder and its parents. If there is none, ask the user where their job-search folder should live (a folder of its own, never inside a code repository), then create there:

- `trajectory.md` from [WORKSPACE.md](WORKSPACE.md), with the Targets section filled in step 3;
- `facts.md` from [FACTS.md](FACTS.md);
- empty folders `sources/` and `applications/`.

Offer to make it a private git repository: it holds personal data, so never a public one.

**Done when** `trajectory.md` exists and you have read it.

## 2. Build the fact file

From the user's documents (put copies in `sources/`) or, with none, an interview asking one question at a time:

- One line per fact, in the candidate's own terms, with its source: `[source: cv-2025.pdf]`, or `[confirmed <date>]` for something the user told you.
- Keep scope as stated: who else was involved, what the candidate did versus what their team or another team did, and numbers exactly as given (approximate stays approximate).
- A fact you inferred (a skill implied by a project, an outcome you'd expect) goes to the user as a question. It's written only once they confirm it, as `[confirmed <date>]`.
- When the user says they did **not** do something ("I didn't lead the migration"), record it under **Not claimed**: it stops a later draft from drifting into it.

**Done when** every role has its employer, title, dates, and at least one fact, and every fact has a source.

## 3. Targets

Fill the Targets section of `trajectory.md` with the user: roles, locations and work arrangement, where they may work without sponsorship, languages and their level, salary floor with its currency, deal-breakers, and the company job boards to scan (the `scout` skill uses these). A target the user hasn't decided stays blank; `evaluate` treats blanks as unknown, not as "anything goes".

**Done when** work authorisation, languages, and salary floor are filled or explicitly marked unknown.

## Writing back

Whenever the user states a new fact about their experience during any trajectory work, add it to `facts.md` in the same turn, as `[confirmed <date>]`, before any draft uses it. A fact that lives only in the conversation is lost to the next application.
