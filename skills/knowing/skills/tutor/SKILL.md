---
name: tutor
description: Use when helping someone else learn from their own work, such as a child's homework or schoolwork in any subject (maths, science, spelling, reading) or a marked test, a student's written work or problem set, or a beginner's code, when a parent or teacher asks how to explain a topic to their learner, or when a learner keeps getting the same thing wrong.
---

# Tutor

Helps the adult in front of you teach someone else, starting from that person's own work. The aim is that the learner understands, not that the homework gets done.

## 1. The learner

For work you'll see again, keep a learner folder: look for `knowing.md` in the current folder or its parents. With none, ask the adult whether to keep one and where, and create it only once they've answered, from the template in the `learn` skill's folder (`<this skill's folder>/../learn/LEARNER.md`). For a child, record the first name and age or school year only; photos of their work are read, not kept, unless the adult asks you to keep them.

## 2. Diagnose from all of the work

Look at every answer, right and wrong, before explaining anything. Find the **pattern** that produces the wrong ones, and check it against each answer: it should predict every wrong answer and be consistent with every right one. A good diagnosis reads like "when the top digit in the ones column is smaller, she takes the smaller digit from the larger one instead of exchanging a ten; the ones she got right never needed an exchange".

If no single pattern fits, say so, name the two likeliest, and give one quick question that would tell them apart.

## 3. Explain at their level

For the adult: the pattern, and why it's a sensible mistake (what the learner is doing right in it).

For the learner, in words for their age: one concrete way to see the idea (objects, money, a drawing, a tiny program they run), then one worked example done together, then one they try themselves. Guide with questions ("how many tens are there now?") instead of giving the answer, and let them find and fix one of their own mistakes.

If the user asks for an illustrated physical mechanism or an idea drawn as a working object, read the plain [figure workflow](../figure/WORKFLOW.md) and follow it for that artifact. Its paths resolve from `../figure/`, not this skill's folder. Do not invoke the hidden figure skill or read its guide for ordinary lessons, homework drawings or process diagrams.

## 4. Practice aimed at the mistake

Write a short practice set of six to ten items: mostly ones that need the idea they're missing, two or three that don't (so they learn when it applies), easy to harder, with the answers and explanations inside each question (the page hides them until checked; the adult reads the `.md` as the key). Render it as an interactive page with the `learn` skill's lesson format and script:

```
node <this skill's folder>/../learn/scripts/lesson.mjs <folder>/lessons/<nn>-<topic>.md
```

For code, the practice is small runnable exercises, each with a test that fails until the idea is right.

## 5. For the session itself

Give the adult what to do at the table: how to open (including how the learner is feeling about it, if the adult mentioned it), the order of the steps above, what to say when they get stuck, and when to stop. Keep it to a session they can actually run.

Log the session in `knowing.md`: the misconception, what helped, and what to check next time.

**Done when** the diagnosis accounts for every answer, a targeted practice set exists with its answers, and the adult has a plan for the session.
