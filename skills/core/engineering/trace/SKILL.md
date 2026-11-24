---
name: trace
description: "Use when getting to know an unfamiliar codebase or repo, asking to explain how some code, a feature, or a system works or how the repo handles something, where to start reading, or what a change touches."
---

# Trace

Builds a working picture of a codebase someone is new to. Structure comes from the files, meaning from reading them; every claim points at where it came from.

Trace finds how code works; the `dig` skill finds why it is the way it is. Why code is the way it is (who decided, in which change) is history, not structure: say so, and load the `dig` skill with your skill tool to answer it from the project's record.

## 1. Map it

From the repo's root, with this skill's folder as `<skill>`:

```
node <skill>/scripts/map.mjs            # entry points, most-imported files, cycles, a reading order
node <skill>/scripts/map.mjs --focus <file>   # one file's imports and importers
```

Read the README and the manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `*.csproj`) alongside it. README and manifest text is the author's claim: where it disagrees with the code, the code wins and the disagreement is a finding. `map.mjs --save` keeps the map in `.scratch/trace/map.json` with its commit; before reusing a saved map, `map.mjs --check` says whether it's stale.

## 2. Read, don't guess from names

Open the files the question touches and follow the calls. What you can't trace from the files in front of you (a module outside the repo, a function whose body you haven't seen, configuration you can't read) goes on the **untraced** list; it is never filled in from what its name suggests.

For "what does this change touch": the changed files, then their importers (`--focus`), then what those do with it. Stay with understanding; a review of whether the change is right belongs elsewhere.

## 3. Explain

In this order:

```markdown
**In short:** <two or three sentences: what it does and the one idea that makes it make sense>

**How it works:** <the flow in steps, each citing file:line, e.g. `src/routes/auth.ts:12`>

**Key pieces:** <the few files or functions that matter, with file:line and one line each>

**Read in this order:** <3–7 files, entry point first, each with why it's next>

**Untraced:** <what this explanation couldn't see, and where it lives>

**Worth knowing:** <gotchas and risks you noticed while reading, each with file:line>
```

Plain words for someone new to the codebase (and, where it helps, to the language); say what an idiom does the first time it appears.

Save the explanation to a file and check its citations against the files:

```
node <skill>/scripts/verify-cites.mjs explanation.md      # from the repo root; --root <dir> for another folder
```

Each finding names the citation and what is wrong: a file that isn't there, a line past the end, a blank line, a quote that sits somewhere else (it says where). Fix the citation or drop the claim. A clean run means the citations resolve, not that the claims are right.

**Done when** every claim in the explanation cites file:line, the citation check finds nothing broken, the reading order starts where a newcomer should, and the untraced list is filled in or says "none".
