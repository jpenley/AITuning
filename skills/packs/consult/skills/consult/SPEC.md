# Consult spec and answer format

The spec is the JSON file you write; the answer object is the JSON the session returns. `consult.mjs check` enforces every rule below and reports every problem with its JSON path.

## Contents

- [Spec](#spec)
- [Context blocks](#context-blocks)
- [Questions and options](#questions-and-options)
- [Conditional questions](#conditional-questions)
- [Pages](#pages)
- [Answer object](#answer-object)
- [Example](#example)

## Spec

| Key | Type | Notes |
|---|---|---|
| `id` | string, optional | Echoed as `specId` in the answer object |
| `title` | string, optional | Page heading |
| `context` | context block, optional | Shown above the first page's questions |
| `pages` | array, optional | Omit for a single page; see [Pages](#pages) |
| `questions` | array, required | In display order |

Unknown keys are errors, so a misspelt key fails the check instead of being ignored.

## Context blocks

A context block is an object with at least one of these keys. It appears as `context` on the spec, a page, or a question, and as `detail` on an option.

| Key | Renders as |
|---|---|
| `markdown` | Paragraphs, `#` headings, `-` and `1.` lists, `>` quotes, fenced code, inline code, `**bold**`, `*italic*`, and `[text](https://...)` links. Raw HTML is shown as text. |
| `mermaid` | A Mermaid diagram (bundled Mermaid 11, `securityLevel: strict`) |
| `images` | An array of `{ "path": "relative/to/spec.png", "alt": "what it shows" }`. Paths stay inside the spec's folder; png, jpg, gif, svg, webp. |
| `html` | A fragment rendered in a sandboxed iframe that resizes to fit. Scripts and inline SVG work. It can't reach the page, the answers, or the server, and it can't load network resources. |

When a block has several keys, they render in the order markdown, mermaid, images, html.

## Questions and options

| Key | Applies to | Notes |
|---|---|---|
| `id` | all | Letters, digits, `_ . -`; unique |
| `kind` | all | `single` (radio), `multi` (checkboxes), or `text` (free text) |
| `prompt` | all | The question |
| `context` | all | Context block shown under the prompt |
| `required` | all | Blocks Submit until answered |
| `options` | single, multi | Non-empty array of options |
| `allowOther` | single, multi | Adds an "Other" text box. On a single question, writing your own clears the chosen option, and the reverse. |
| `min`, `max` | multi | Bounds on the number of choices, "Other" counting as one. `min` applies once anything is chosen; add `required` to force a choice. |
| `showIf` | all | See [Conditional questions](#conditional-questions) |

Every question also gets an optional note box.

An option is `{ "id", "label", "detail"?, "recommended"?, "why"? }`. `recommended: true` shows a badge; `why` is shown under it and is allowed only on a recommended option. A single question recommends at most one option.

## Conditional questions

`"showIf": { "<question id>": "<option id>" | ["<option id>", ...] }` shows the question only while that earlier question has one of the listed options selected. With several keys, all must hold. The parent must be a `single` or `multi` question listed earlier in `questions` and on the same or an earlier page.

A hidden question is left out of the answer object, even if the user answered it before hiding it. A page whose questions are all hidden is skipped.

## Pages

`"pages": [{ "title"?, "context"?, "questions": ["<id>", ...] }]` splits the questions into steps with Back and Next. Every question appears on exactly one page. Answers carry across pages; Submit is on the last page, and it reports problems on any page.

## Answer object

```json
{
  "status": "submitted",
  "specId": "cache-strategy",
  "title": "Cache strategy for the report API",
  "answerFile": "/tmp/scratch/cache.consult.answer.json",
  "endedAt": "2026-11-24T20:30:57.246Z",
  "answers": [
    {
      "id": "store",
      "prompt": "Where should cached reports live?",
      "kind": "single",
      "answered": true,
      "selected": [{ "id": "redis", "label": "Redis (existing cluster)" }],
      "other": null,
      "text": null,
      "note": "Only if the sessions cluster has headroom.",
      "followedRecommendation": true
    }
  ]
}
```

- `status`: `submitted`, `cancelled`, `closed`, `timeout`, or `error` (exit codes 0, 2, 3, 4, 1).
- `answers`: one entry per visible question, in spec order.
- `answered`: something was selected, written in "Other", or typed in a text answer. A note alone doesn't count.
- `followedRecommendation`: `null` when the question has no recommendation or no answer. Otherwise `true` when every recommended option is selected and "Other" is empty.
- `answerFile`: the same object on disk, `null` if it couldn't be written.

An error has `{ "status": "error", "error": "...", "problems": ["questions[2].min: must not exceed max", ...] }`.

## Example

```json
{
  "id": "cache-strategy",
  "title": "Cache strategy for the report API",
  "context": { "markdown": "The report endpoint takes **~4s** at p95 because it recomputes aggregates on every request." },
  "pages": [
    { "title": "Storage", "questions": ["store", "ttl"] },
    { "title": "Invalidation", "questions": ["invalidate", "concerns"] }
  ],
  "questions": [
    {
      "id": "store", "kind": "single", "required": true, "allowOther": true,
      "prompt": "Where should cached reports live?",
      "context": { "mermaid": "flowchart LR\n  C[Client] --> A[Report API]\n  A -->|hit| K[(Cache)]\n  A -->|miss| D[(SQL)]" },
      "options": [
        { "id": "memory", "label": "In-process memory", "detail": { "markdown": "No new infrastructure. Each of the 4 pods keeps its own copy, so the hit rate drops about 4x and a deploy empties it." } },
        { "id": "redis", "label": "Redis (existing cluster)", "recommended": true, "why": "Already in production for sessions; I'd change this if that cluster is near its memory limit.", "detail": { "markdown": "One network hop (~1ms), shared by all pods, survives deploys." } }
      ]
    },
    {
      "id": "ttl", "kind": "single", "prompt": "How long should an entry live?", "showIf": { "store": "redis" },
      "options": [
        { "id": "5m", "label": "5 minutes", "recommended": true, "why": "Matches the ETL refresh cadence." },
        { "id": "1h", "label": "1 hour" }
      ]
    },
    {
      "id": "invalidate", "kind": "multi", "min": 1, "max": 2, "required": true,
      "prompt": "What should invalidate a cached report?",
      "options": [
        { "id": "etl", "label": "ETL batch completes", "recommended": true, "why": "The only writer for the aggregate tables." },
        { "id": "edit", "label": "A user edits a source record" },
        { "id": "manual", "label": "Manual purge button for support" }
      ]
    },
    { "id": "concerns", "kind": "text", "prompt": "Anything that would make you reject this plan?" }
  ]
}
```
