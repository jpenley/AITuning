# AITuning

Agent skills, packs, and mods distributed from this checkout. This glossary covers terms whose meaning is specific to the tools built here.

## Consult

**Consult session**:
One run of the consult CLI: it serves a local page built from one Spec and ends with exactly one Answer object.
_Avoid_: feedback session, form, survey

**Spec**:
The JSON document Claude writes to describe a Consult session: its questions, options, pages, and Context blocks.
_Avoid_: questionnaire, form definition, page source

**Context block**:
Explanatory content attached to a question or option (markdown, Mermaid diagram, image, or sandboxed HTML) that never collects an answer itself.
_Avoid_: description, detail panel, explanation

**Answer object**:
The self-describing JSON a Consult session prints on exit: a status plus one entry per visible question that restates the prompt and the chosen options' ids and labels.
_Avoid_: response, result, form data
