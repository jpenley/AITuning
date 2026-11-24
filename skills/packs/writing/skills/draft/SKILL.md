---
name: draft
description: Write a new piece with the author, block by block, from their notes or from an interview that gathers them.
disable-model-invocation: true
---

# Draft

Writes a new piece (a post, essay, talk, or article) *with* the author: their material, their angle, one block at a time, each agreed before the next. Editing an existing draft is the `prose` skill's job, not this one. Adapted from mattpocock's `writing-fragments`, `writing-shape`, and `writing-beats` (MIT).

Ask once where the piece should be saved, if the user didn't say, and remember it.

## 1. The pile

The **pile** is the author's raw material: notes, a transcript, a list of fragments, a rant. With a pile, read all of it first. With none, or too little to fill a piece, gather it: interview the author, one question at a time, about what they noticed, what happened, what they'd say to a friend, and save each usable fragment (a sharp line, a claim and its reason, an anecdote, an analogy, a quote) to `<name>-pile.md`, separated by `---`. Push for a **name for the central idea**: one short phrase the piece can hang on.

The pile is the author's. You rework its material, and you never add a fact, an anecdote, a number, or a quote the pile doesn't hold. When the piece needs something the pile lacks, name the gap and ask: "We need an example here and the notes don't have one. Give me one, or we cut this part." When the gap is a published fact (a figure, a study's finding, a dated event, a quote someone said in print), offer a third answer: "or I research it."

Then list the gaps you can already see (a claim with no example behind it, a before-and-after with one side missing, a term the notes use but never explain) as questions for the author.

**Sourced fragments.** On the author's yes, research the gap. A **checked source** is a page you opened and read yourself whose own text states the claim; a search snippet, a summary, another article's paraphrase, or your memory is unchecked. Each fact you found enters the pile as one fragment:

```
[sourced] <the claim, no broader than the source states it: same figure, year, population, and qualifiers>
Source: <title>, <author or publisher>, <date>. <URL>
Says: "<the source's own words, verbatim, stating every figure and finding in the claim>"
```

Show the author each sourced fragment before a block uses it. When no checked source states the claim, report what you found and the gap stays open: the author gives one or you cut. Anecdotes, opinions, and experience come only from the author.

**Done when** you've read the whole pile, can name the piece's central idea in one sentence, and have listed its gaps.

## 2. The reader

Settle with the author who the reader is and what they already know when they start: those concepts are **grounded**. Every other concept has to be grounded in the piece (the idea and its name land together) before a later block leans on it. Keep a running list of what's grounded.

## 3. Openings

Write two or three candidate openings, each implying a different angle or thesis, each using only material from the pile. An opening leans only on grounded concepts (step 2): a term the reader lacks is left out or explained in plain words where it first appears. Show the openings with the gaps from step 1 and stop: the author picks one or asks for a blend, and answers what they can. Don't write past the opening before they choose.

## 4. Block by block

Given where the piece now stands, what does the reader need next? Offer the next block (or two or three candidates when the direction is open), pulled from the pile, leaning only on grounded concepts, and say what it grounds. Argue its form out loud when it matters: prose for an argument, a list for parallel items, a table for a shape that repeats, a quote when the wording is the point.

Append each agreed block to the file right away, and re-read the file before every write: the author may have edited it. Rewrite a block in place when they ask; leave the rest alone. Push back on a block that doesn't earn its place ("if we cut this, what breaks?") and on drift from what the opening promised.

The author decides when the piece is done.

## 5. Finish

Check the sourcing first. List every published fact in the finished piece (a figure, a study's finding, a dated event, a quote) beside the pile fragment it came from. A fact sourced in the pile carries its citation in the piece, in the form the author picks (an inline link or a numbered reference list), and claims no more than the fragment's `Says:` line. Put each fact that traces to no fragment, or that outgrew its source in the edit, to the author: source it, soften it to what the source says, or cut it.

Then load the `prose` skill with your skill tool, follow its VOICE.md edit mode and run its linter over the finished piece, and report what changed. Re-check any sourced sentence the edit reworded against its `Says:` line.

**Done when** the author has called the piece done, every block in it came from the pile or from the author's answers, every published fact traces to a pile fragment, each sourced one cited and inside its `Says:` line, and the linter exits 0 or each remaining finding has a reason.
