---
name: diagram
description: Use when the user asks for a diagram, flowchart, sequence diagram, state machine, or entity-relationship diagram, or when a system, request flow, process, or data model is easier to show than to describe, including a diagram of real code or of a document's contents.
---

# Diagram

Draws a diagram as Mermaid text (GitHub, most docs tools, and every agent already read it) and checks it with the Mermaid CLI before handing it over. A diagram that parses is not a true one: the facts come from the source, and the check says which ones you tied to it.

## 1. Pick the diagram

One diagram answers one question.

| The question | Type |
|---|---|
| How parts connect, or how a process flows | `flowchart LR` (pipelines) or `flowchart TD` (hierarchies) |
| Who calls whom, in what order | `sequenceDiagram` |
| What states something has and how it moves between them | `stateDiagram-v2` |
| Which tables or entities relate to which | `erDiagram` |
| Which types extend or use which | `classDiagram` |
| How two or more options differ | One `flowchart` with the shared parts drawn once and each option's added or changed nodes and edges labelled with its option (`A: publishes event`) or styled per option; or a before/after pair of only the part that changes |

More than about fifteen nodes means two diagrams, or `subgraph` groups.

## 2. Get the facts

For a real system, open the code before drawing. Every node and edge is something you read in a file, and the line above it says where:

```
%% src: src/routes/auth.ts:12 "verifyPassword(user, pw)"
Login[Login handler]
```

The `%% src:` comment goes on its own line directly above the node or edge (Mermaid ignores it there and rejects it after a statement); several `path:line` references may share one comment. Quote a short piece of the line: a line number alone only proves the line exists, and the quote is checked against the file. What you couldn't trace is left out, or drawn dashed (`-.->`) with the label "unverified", never filled in from a name. From a brief in words, the brief is the source; say so in the report.

For an unverified flowchart node, start its visible label with `Unverified:`. For an unverified edge, use a dashed arrow and start its edge label with `unverified`:

```
Future["Unverified: future worker"]
Future -.->|unverified: possible storage| Storage
```

An unverified sequence message uses a dashed arrow and starts its message text with `unverified` (`API-->>Worker: unverified: possible refresh`). Edge and message labels can add descriptive text after the marker, with or without a colon. These labels apply only to their own statements. Cite each remaining claim. For other diagram forms, omit claims you cannot trace.

## 3. Write it

On the lines after the diagram type, put `accTitle: <the question>` and `accDescr: <the one claim the diagram makes>`: screen readers announce them, and the claim travels with the figure.

Declare each node once, with its label and shape (`API[API service]`), then refer to it by id. Declare sequence participants before their messages. Quote a label with punctuation (`Cache["Cache (Redis)"]`). Keep labels short; put words on an edge only where they change the meaning. Save the text as `<name>.mmd`, or as a ```` ```mermaid ```` block in the document it belongs to.

## 4. Check

With this skill's folder as `<skill>`:

```
node <skill>/scripts/diagram-check.mjs <name>.mmd --root <repo> --out <name>.png
```

It parses and renders with `mmdc` (a syntax error comes back with its line), verifies every `%% src:` line against the files, and flags an id that is one letter off another id, which Mermaid draws as a second node without complaint. For a diagram of real code add `--require-src`. Each statement needs a preceding source comment with a quoted snippet, or a visible unverified label in the forms above. A citation covers one statement; put separate claims on separate lines. Sequence participant declarations and layout syntax need no citation. For conceptual diagrams from a brief, omit `--require-src`. Fix each finding and run it again. It takes a `.md` file too and checks every mermaid block in it.

`mmdc not found` means mermaid-cli isn't installed: `npm install @mermaid-js/mermaid-cli` in the project or globally (Node 22.13 or later; it fetches a headless Chrome). Without it, `--no-render` runs the static checks only, and the report says the diagram was not rendered.

## 5. Look at it

Open the image. Labels legible and not cut off, nothing overlapping, the main path reading in one direction, the picture answering the question. Fix problems in the text (direction, grouping, fewer nodes), not in the image. A harness that can't show you an image has not looked at it.

## 6. Report

Give the diagram (its text or its path), then the checks as separate lines: parsed and rendered (yes, no, or not rendered), how many statements cite a source, how many are explicitly unverified, whether all the citations resolve, and whether you looked at the image. Check whether the cited code supports the diagram's meaning; matching snippets establish traceability. Say what the diagram leaves out.

**Done when** the check comes back clean, or each remaining finding is explained in the report, and the report separates what was checked by the script from what you saw.
