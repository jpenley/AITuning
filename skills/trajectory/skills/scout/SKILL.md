---
name: scout
description: Use when looking for openings to apply to, checking companies' careers pages or Greenhouse, Lever, or Ashby boards for new roles, adding a vacancy or its link to the application inbox, or choosing which employers to watch.
---

# Scout

Gathers postings into the workspace inbox (`inbox.md`) for the `evaluate` skill. Two ways in: postings the user brings, and the public job boards of companies they name. Job sites without a public posting API (LinkedIn, Indeed, national job boards) forbid scraping, so from them a posting only comes in the way a person reads it: the user pastes it or gives the link to one posting.

## 1. Workspace

Find `trajectory.md` in the current folder or a parent and read its Targets. If there is none, load the `profile` skill with your skill tool and create the workspace first.

## 2. Postings the user brings

For each pasted posting or single-posting link: add a line to `inbox.md` (`- [ ] <title> | <company> | <location> | <link or "pasted">`), and keep pasted text for `evaluate` in the conversation or a file under `applications/`. One posting the user asks about right away goes straight to `evaluate`.

## 3. Company job boards

For each company the user wants to watch, find its board from its careers page link: `boards.greenhouse.io/<board>` or `job-boards.greenhouse.io/<board>` (greenhouse), `jobs.lever.co/<board>` (lever; `jobs.eu.lever.co` is lever-eu), `jobs.ashbyhq.com/<board>` (ashby). Add each to **Boards to scan** in `trajectory.md`. A company on another system (Workday, SmartRecruiters, its own site) has no board here: tell the user, and take its postings by link.

Then scan, with the title and location filters built from the Targets:

```
node <this skill's folder>/scripts/boards.mjs scan <ats>:<board> [...] --match "<role regex>" --where "<location regex>"
```

It adds only postings not already in the inbox and prints a JSON summary (the first 25 and a count). Sources and limits: [SOURCES.md](SOURCES.md).

A posting's `checks` (also at the end of its inbox line, after `check:`) are signs that it may be stale or kept open to collect applicants rather than to hire now: posted more than 90 days ago, pipeline or evergreen wording in its title or team, or the same title and location posted again at least 30 days apart. Each is a fact from the board, not a verdict: senior roles stay open for months, and a repeat can be a second opening.

## 4. Report

Tell the user how many new postings each board gave, which boards failed and why, and the few that best fit the Targets, with any checks on those few. They pick what goes to `evaluate`.

**Done when** the inbox holds every new posting and the user has the counts, the failures, and the shortlist.
