---
name: understand
description: Use when making sense of a body of material someone is new to (a folder of notes, papers, docs, reports, or a wiki), asking what a set of sources says, where they agree or disagree, or where to start reading in it.
---

# Understand

Builds a working picture of a body of material someone is new to: notes, papers, docs, a wiki. Structure comes from the files, meaning from reading them; every claim points at where it came from.

## 1. List and read

List what's there (files, dates, authors, kinds), then read for three things, each tied to the file and the passage:

- **Claims**: what each source asserts, in its own words where it matters.
- **Relations**: which sources support, contradict, or build on each other. Be conservative: a shared theme isn't support.
- **Open questions**: what the material raises and doesn't settle.

What you can't read (a file in a format you can't open, a source the material cites but doesn't include) goes under **Missing**; it is never filled in from what its title suggests.

## 2. Explain

In this order:

```markdown
**In short:** <two or three sentences: what the material is about and the one idea that makes it make sense>

**Main ideas:** <each with the sources behind it, cited as `path "the quoted words"`>

**Read in this order:** <3–7 files, the best starting point first, each with why it's next>

**Contested:** <where sources disagree, each side cited>

**Missing:** <what the material doesn't settle or couldn't be read, and where it might be>
```

Plain words for someone new to the subject; say what a term means the first time it appears.

Save the explanation to a file and check its citations against the files:

```
node <skill>/scripts/verify-cites.mjs explanation.md      # from the material's folder; --root <dir> for another folder
```

`<skill>` is this skill's folder. Cite a passage as `path "the quoted words"`, or `path:line` where the file has lines worth pointing at. Each finding names the citation and what is wrong: a file that isn't there, a line past the end, a blank line, a quote that sits somewhere else (it says where). Fix the citation or drop the claim. A clean run means the citations resolve, not that the claims are right.

**Done when** every claim in the explanation cites file and passage (or file:line), the citation check finds nothing broken, the reading order starts where a newcomer should, and the missing list is filled in or says "none".
