---
name: survey
description: Turn a question only someone else can answer into a plain-text questionnaire to send by email or chat, then fold their answers back into the work.
disable-model-invocation: true
---

# Survey

Turn something the user can't answer alone into a **questionnaire** for the one person who can: to fill in on their own time, or to go through together in a meeting.

**Interview the user about the send, not the subject.** The user can't answer the subject questions (that's why the questionnaire exists), but they can always say who it's for and what they need back.

## 1. Who is it going to?

Ask, one question at a time, the recipient's role, expertise, and relationship to the user. That sets the tone and how much context the questionnaire must carry. **Done when** you know who the recipient is and what they know that the user doesn't.

## 2. What do you need back?

Ask, one question at a time, for the specific decisions or facts the user can't settle alone. **Done when** you have a concrete list of what the user must be able to do or decide afterwards.

## 3. Write it

Write questions aimed at the gap between steps 1 and 2, in the plain-text format below. Use the Markdown branch below when the user requests a document or `.md` artifact; otherwise show it in the conversation, ready to paste, and save a `.txt` copy with the related work: `.scratch/<feature-slug>/survey-<slug>.txt` when a feature is in progress, otherwise the current directory. **Done when** every need from step 2 is covered by a question.

## Format: plain text for email and chat

The questionnaire will be pasted into an email or a chat app, so it uses **no markdown**: no `#` headings, no `**bold**`, no tables. It must read cleanly both as an email body and as a chat message.

- **Opening**: a greeting and one or two lines on what this is and why it matters (the decision riding on it).
- **Logistics**: how long it takes, the deadline, and that "not sure" or a partial answer is useful.
- **Context**: one short paragraph for someone who wasn't in the user's head: enough to answer well.
- **Sections**: themes labelled with a simple divider line, `--- THEME ---`, when there are more than a handful of questions.
- **Questions**: numbered, most important first (the recipient may only give it one pass), one idea each, never compound. Under each, a short *why this matters* in parentheses only where the question could be misread or invite a throwaway answer, then an `Answer:` line.
- **Closing**: "Is there anything we didn't ask that we should know?"

```
Hi Dana, a few questions about the billing export so we can finish the design.
Most important first; "not sure" is a useful answer.

Why: we need to choose between a nightly batch and a live feed by Friday.
How long: about 10 minutes. By: Thursday.

--- VOLUMES ---

1. Roughly how many invoices go out on a typical month-end day?
   (This decides whether a nightly batch is fast enough.)
   Answer:

--- ANYTHING ELSE ---

Is there anything we didn't ask that we should know?
```

## Markdown document branch

For a requested Markdown questionnaire, save `survey-<slug>.md` in the requested location or beside the related work and report the path. Keep the same most-important-first questions, one idea each, and an answer stub under each question. Use a title, Purpose, From/To and how answers will be used, one paragraph of Context, and How to answer. Include a deadline only when supplied; welcome partial answers and uncertainty. Group questions under `##` theme headings and end with Anything else. Every need identified in step 2 must map to a question.

## 4. When the reply comes back

When the user pastes the reply, match it against the needs from step 2: list which are answered, which are partly answered, and which are still open. Then carry the answers into `grill` or `spec`, and offer a short follow-up for anything still open.
