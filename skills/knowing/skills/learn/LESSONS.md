# Writing a lesson

A lesson is a Markdown file that `scripts/lesson.mjs` renders into one self-contained interactive page: the learner answers each question before seeing its explanation.

## Shape

One lesson teaches one idea, in about ten to fifteen minutes:

1. **Hook**: the problem the idea solves, tied to something the learner already knows.
2. **The idea**: short, plain, in the learner's terms; one new word at a time, each defined when it first appears.
3. **Worked example**: shown step by step, including what goes wrong and how it's fixed.
4. **Questions**: three to five, from recall to use to a small twist. At least one asks the learner to predict before being told.
5. **Then**: say what the next lesson covers, and give one thing to try before it.

## Format

```markdown
# <Lesson title>

<paragraphs, lists, **bold**, `code`, fenced code blocks>

:::example
<a worked example>
:::

:::hint
<shown only when the learner opens it>
:::

:::question
<the question>
- [ ] a wrong option
- [x] the right option (mark every right one with [x])
> why the answer is what it is, shown after the learner checks
:::

:::question
<a short-answer question>
= an accepted answer
= another accepted answer
> why
:::
```

The render command is in `SKILL.md`; it writes the `.html` beside the lesson and stops with an error for a question with no right answer, a question with no explanation, or an unclosed block.
