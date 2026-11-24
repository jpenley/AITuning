# trajectory

Career skills: finding, judging, applying to, and interviewing for jobs, and reading the offer, without an agent overstating what the candidate has done. A separate plugin from flowstate; it never loads or refers to a flowstate skill.

## Skills

| Skill | Use it to | Scripts |
|---|---|---|
| `profile` | Set up the workspace; build the fact file from a CV, LinkedIn export, or an interview; set the search targets | none |
| `scout` | Gather postings: pasted, linked, or from the public job boards of companies you name | [skills/scout/scripts/boards.mjs](skills/scout/scripts/boards.mjs) |
| `evaluate` | Judge one posting: eligibility gates, each requirement matched or shown as a gap, anomalies in the posting, a verdict | none (records through `track`'s script) |
| `tailor` | Write the CV and cover letter from the facts, render the PDF, check it the way an ATS reads it | [skills/tailor/scripts/render.mjs](skills/tailor/scripts/render.mjs), [skills/tailor/scripts/ats-check.mjs](skills/tailor/scripts/ats-check.mjs) |
| `track` | Keep the tracker, draft follow-ups (never sent by the agent), report how the search is going | [skills/track/scripts/tracker.mjs](skills/track/scripts/tracker.mjs) |
| `interview` | Prepare for one round: likely questions ranked with reasons, answers built from the fact file, a practice plan; correct the prep after the round | none (records through `track`'s script) |
| `offer` | Read an offer clause by clause: each quoted and tagged, promises checked against the letter, legal points as questions for a lawyer; no verdict on signing | none (records through `track`'s script) |

All are model-invoked. They hand off to each other in the order above, but each works alone.

## The workspace

Your job search lives in one folder you choose, never in a code repository, marked by `trajectory.md` at its root. `profile` creates it:

- `trajectory.md`: the layout and your targets (roles, locations, work authorisation, languages, salary floor, deal-breakers, boards to scan).
- `facts.md`: the **fact file**. Every claim an application makes traces to a line here, and each line carries its source (`[source: cv.pdf]` or `[confirmed <date>]`). **Not claimed** lists what you've said you haven't done.
- `inbox.md`, `tracker.md`, `sources/`, and `applications/<date>-<company>-<role>/`, holding `posting.md`, `evaluation.md`, `cv.md`/`.pdf`, `cover-letter.md`/`.pdf`, follow-up drafts, `interview-<round>.md`, and `offer.md`.

It holds personal data: keep it private.

## Requirements

- Node 20 or later for the scripts (no npm packages).
- `render.mjs`: Chrome, Edge, or Chromium (found automatically, or `--browser` / `TRAJECTORY_BROWSER`). It prints with a throwaway browser profile, never your own.
- `ats-check.mjs`: `pdftotext` from Poppler (Git for Windows ships it under `mingw64/bin`; `brew install poppler`; `apt install poppler-utils`).
- Each script has `--selftest`.

## What it won't do

- **Scrape job sites.** `scout` reads only the documented public APIs that Greenhouse, Lever, and Ashby publish for companies' own careers pages. From LinkedIn, Indeed, and national boards, a posting comes in the way you read it: pasted, or one link.
- **Submit or send anything.** Applications, follow-ups, and replies are drafts you send.
- **Give legal advice or a verdict on an offer.** Whether a clause holds up depends on where you live and work; `offer` writes it as a question for an employment lawyer.
- **Write inferred facts as true.** A skill or outcome the agent infers goes to you as a question; it's recorded once you confirm it.

## Sources and licences

Ideas were adapted and re-expressed; no text or code was copied. Upstream repositories are linked below.

- **MadsLorentzen/ai-job-search**: https://github.com/MadsLorentzen/ai-job-search. MIT License, Copyright (c) 2026 Mads Lorentzen. Grounding every claim in a fact file with write-back of confirmed facts; the interview-defence test behind `tailor`'s verb and outcome rules; every requirement answered or shown as a gap; checking the PDF's text layer and date ranges (from their Workday en-dash failure); draft-only follow-ups, at most two; status changes proposed from email with the evidence quoted.
- **Snailclimb/JavaGuide** (interview preparation plan and agent project interview guide): https://github.com/Snailclimb/JavaGuide. Apache License 2.0, by Guide (Snailclimb); its articles ask for attribution when reprinted, and none is reprinted here. Practising each answer to three levels (cold in under a minute, holding up under follow-ups, tied to the candidate's own work); preparing the follow-ups every CV claim invites; a 30-second and a 3-minute project story with the request path; a per-question debrief that narrows the next round's prep.
- **gzchenhao/openhire**: https://github.com/gzchenhao/openhire. MIT License, Copyright (c) 2026 OpenHire Protocol. Ghost-job signals from the employer's own posting date and from relisting, and the finding that a board's last-updated date moves without any change; `scout`'s checks keep only the signals that held up on live boards (see [skills/scout/SOURCES.md](skills/scout/SOURCES.md)).
- **career-ops-hq/career-ops**: https://github.com/career-ops-hq/career-ops. MIT License, Copyright (c) 2026 Santiago Fernández de Valderrama. Postings as untrusted data, with planted instructions reported as anomalies; gates quoted verbatim from the posting; the portal-scan idea narrowed here to public ATS APIs; the canonical tracker file with a fixed status vocabulary; checking whether fit verdicts predicted outcomes, with small samples withheld.
