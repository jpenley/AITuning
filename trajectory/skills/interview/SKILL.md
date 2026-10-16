---
name: interview
description: Use when preparing for a job interview or a specific interview round, practising the questions an interviewer or hiring manager will ask, building answers or stories from the candidate's experience, or debriefing after an interview.
---

# Interview

Prepares the candidate for one interview round from what the role needs and what they've actually done, and folds what happened in the round back into the preparation.

## 1. Inputs

From the workspace (find `trajectory.md` in the current folder or a parent): `facts.md`, and for this application its `posting.md` and `evaluation.md`. From the candidate: the round (who, how long, what kind), and any feedback from earlier rounds. Without a workspace, work from what the candidate gives you, treat their notes as the fact file, and give the prep in the reply instead of saving it or recording the round (steps 4 and 5).

## 2. The questions they'll likely face

Rank them, most likely first, from four sources: feedback from earlier rounds (what they wanted more of comes first), the evaluation's gaps and must-haves, the round's stated focus, and what the CV invites. Every skill the CV claims, even "familiar with", invites follow-ups on how it works, where it fits, and how it fails; prepare those for each claim. For each question, say why it's likely.

## 3. Answers built from facts

For each likely question, an answer outline built only from `facts.md`: the situation, what the candidate did, the result, each line traceable to a fact. Where a strong answer needs a detail the facts don't hold (what an incident was, what changed after it), ask for it with a bracketed question; never fill it in. When the candidate gives a detail, record it as the `profile` skill's *Writing back* says before using it.

For the main project, two versions: 30 seconds (the problem, their part, one result) and 3 minutes (adding the path a request takes through the system, the choices made and why).

For a gap (a requirement they don't meet), the answer says what they have done that's nearest, plainly, and what they'd need to learn; it never implies they've done the thing.

## 4. Practice and questions to ask

A short practice plan (which questions to say aloud, in what order, with timing). Each question is practised to three levels: answered cold in under a minute; holding up under follow-ups (how it works, when it applies, how it fails, the alternatives); tied to something the candidate did. The plan starts with the questions at the lowest level.

Then three to five questions for the candidate to ask the interviewer, drawn from the posting and the evaluation's open questions.

Save the prep as `applications/<folder>/interview-<round>.md`.

## 5. After the round

When the candidate reports back, add a debrief to the prep file: for each question they struggled with, what was asked, how they answered, what was missing, where the right answer is, and the answer for next time. Then re-rank the next round's questions: a topic asked in more than one round moves up; a topic no round has asked and neither the CV nor the posting mentions is dropped.

Correct the prep file in place: a fact that turned out wrong is corrected in `facts.md` (the line replaced, as `[confirmed <date>]`) and struck through in the prep file with the correction beside it, not left for the next round. Record the round and its outcome with the `track` skill's script (`<this skill's folder>/../track/scripts/tracker.mjs set <id> --status interviewing --note "<round, date>"`).

**Done when** the likely questions are ranked with reasons, every answer outline traces to `facts.md` or holds a bracketed question, and the prep file is saved (with no workspace: the prep is in the reply).
