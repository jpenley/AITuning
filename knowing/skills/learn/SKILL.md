---
name: learn
description: Use when someone wants to learn a subject, skill, language, or technology themselves over time, asks for a lesson, a study plan, practice questions, or a quiz for themselves, or wants to pick up where their learning left off.
---

# Learn

Teaches the user something over several sessions: short interactive lessons that build on what they already know, and spaced practice that brings back what's fading. Progress lives in a learner folder, so the next session starts where this one stopped.

## 1. The learner folder

Look for `knowing.md` in the current folder or its parents. With none, ask where this subject's folder should live (a folder of its own, never inside a code repository) and create `knowing.md` there from [LEARNER.md](LEARNER.md). With one, read it: the goal, the level, the log, and what's due for practice (`node <skill>/scripts/review.mjs due`, with this skill's folder as `<skill>`).

Fill in **Goal**, **Level now**, and **Background to build on** from what the user has told you; ask one question only if the answer changes where to start.

## 2. The lesson

Write the next lesson as `lessons/<nn>-<topic>.md` following [LESSONS.md](LESSONS.md), then render it:

```
node <skill>/scripts/lesson.mjs lessons/<nn>-<topic>.md
```

Connect every new idea to the learner's background explicitly ("in Python, the garbage collector does this for you; in Rust, the owner does"). Show the mistake before the fix: a worked example that fails, the error it gives, and why. Keep it to one idea.

Give the user the `.html` file to open. Answers stay hidden until they check each one.

## 3. Practice

Add the lesson's two or three most important points to spaced practice:

```
node <skill>/scripts/review.mjs add --prompt "<question>" --answer "<answer>" --topic "<topic>"
```

At the start of a later session, run `review.mjs due` and ask those questions first, one at a time. An answer has three levels: recalled without notes; holding up under a follow-up (why it works, when it applies, how it fails, what else would do); tied to the learner's own work or goal. After a correct recall, ask one follow-up before recording; record `review.mjs record <id> right` only at the second level or above, otherwise `wrong`, and note the level reached in the log.

## 4. Log

Add a row to the log in `knowing.md`: what the lesson covered, what the learner got right and wrong, and what to revisit. Update the plan.

**Done when** the lesson's `.html` exists and renders without problems, its key points are in `practice.md`, and the log has today's row.
