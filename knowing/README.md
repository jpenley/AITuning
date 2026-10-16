# knowing

Learning and research skills: making sense of a body of material, a sourced investigation, what's new in a field, lessons for yourself, and teaching someone else from their own work. A separate plugin from flowstate; it never loads or refers to a flowstate skill.

## Skills

| Skill | Use it to | Scripts |
|---|---|---|
| `understand` | Make sense of a body of material someone is new to (notes, papers, docs, a wiki): its claims, how the sources relate, a reading order | [skills/understand/scripts/verify-cites.mjs](skills/understand/scripts/verify-cites.mjs) (checks the explanation's citations against the files) |
| `investigate` | Answer a question from evidence: sub-questions, sources ranked by strength, disagreements shown, a cited report | [skills/investigate/scripts/cite.mjs](skills/investigate/scripts/cite.mjs) |
| `latest` | Catch up on what's new in a field over a window, grouped by theme, every item linked | [skills/latest/scripts/latest.mjs](skills/latest/scripts/latest.mjs) |
| `learn` | Learn something yourself over sessions: interactive lessons, spaced practice, a log | [skills/learn/scripts/lesson.mjs](skills/learn/scripts/lesson.mjs), [skills/learn/scripts/review.mjs](skills/learn/scripts/review.mjs) |
| `tutor` | Teach someone else from their work: a child's schoolwork or a beginner's code, finding the pattern behind the mistakes | uses `learn`'s scripts |

All are model-invoked, and each works alone.

## The learner folder

`learn` and `tutor` keep progress in one folder per learner or subject, marked by `knowing.md` at its root (the goal, the level, a log, and the plan), with `practice.md` for spaced practice and `lessons/` for the lessons. It lives outside any code repository.

For a child, the folder holds a first name and age or school year only: no school name, surname, or other identifying details. Photos of their work are read, not kept, unless you say so.

## Requirements

- Node 20 or later for the scripts (no npm packages).
- `latest.mjs` uses only public APIs: arXiv (no key), Hacker News through Algolia (no key), and GitHub (through `gh` when you're logged in, otherwise the anonymous API with its lower rate limit). OpenAlex joins when `OPENALEX_API_KEY` is set. What it leaves out (Reddit, YouTube) and why: [skills/latest/SOURCES.md](skills/latest/SOURCES.md).
- `cite.mjs` uses Crossref's keyless REST API, which carries the Retraction Watch database. Set `CROSSREF_MAILTO` to your email address to use Crossref's polite pool; without it, nothing identifies you.
- Each script has `--selftest`.

## Sources and licences

Ideas were adapted and re-expressed; no text or code was copied. Upstream repositories are linked below.

- **mvanhorn/last30days-skill**: https://github.com/mvanhorn/last30days-skill. MIT License, Copyright (c) 2026 Matt Van Horn. A fixed time window over several public sources; the same story merged across sources; ranking by engagement, recency, and cross-source agreement; a digest grouped by theme with every item linked. The source list here is narrower (see [skills/latest/SOURCES.md](skills/latest/SOURCES.md)).
- **Egonex-AI/Understand-Anything**: https://github.com/Egonex-AI/Understand-Anything. MIT License, Copyright (c) 2026 Yuxiang Lin. The map-then-tour approach (list the structure first, then a guided reading order) applied to a body of documents.
- **mattpocock/skills** (`teach`): https://github.com/mattpocock/skills. MIT License, Copyright (c) 2026 Matt Pocock. A learning workspace kept across sessions, short lessons with retrieval practice, and a learning record.
- **Snailclimb/JavaGuide** (interview preparation plan): https://github.com/Snailclimb/JavaGuide. Apache License 2.0, by Guide (Snailclimb); its articles ask for attribution when reprinted, and none is reprinted here. Grading an answer at three levels (recalled cold, holding up under follow-ups, tied to the learner's own work) instead of right or wrong.
- **wedo911/citeguard**: https://github.com/wedo911/citeguard. MIT License, Copyright (c) 2026 citeguard contributors. Checking cited DOIs against Crossref for retractions, corrections, and expressions of concern, reading both `update-to` and the backfilled `updated-by`, with a "RETRACTED:" title as the last resort; [skills/investigate/scripts/cite.mjs](skills/investigate/scripts/cite.mjs) is written from Crossref's documentation and live responses.
- **cursor/plugins** (pstack `how` and `teach`): https://github.com/cursor/plugins. MIT License, Copyright (c) 2026 Lauren Tan. Explaining by reading the sources rather than guessing from names or titles, naming what couldn't be read, and the smallest complete answer first.
- **claude.ai deep-research** (built-in skill, no licence file; the idea only, re-expressed): `investigate`'s fanning out: one researcher per sub-question with a budget and stop conditions, notes as Takeaway, Cited findings, Inferences and Gaps, and a synthesis that keeps unsourced claims out (tested 2026-10-07, a private development record).
