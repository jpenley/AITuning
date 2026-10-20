---
name: tailor
description: Use when writing or rewriting a CV, résumé, experience bullets, or cover letter for a specific role, making application materials match a vacancy's requirements or keywords, producing the application PDF, or checking that a CV parses in applicant tracking systems.
---

# Tailor

Writes requested application material for one posting from the candidate's fact file. PDF delivery also renders and checks it the way an applicant tracking system reads it.

## Choose the output first

- **Text only**: when the user asks for bullets, a passage, a rewrite or Markdown only, draft only that material. Do not render, run PDF/ATS tools, install their prerequisites or create application files solely to make an unrequested PDF.
- **PDF delivery**: for a complete application document with no text-only limit, or an explicit PDF request, follow the rendering and ATS steps. A missing tool remains a blocker to PDF delivery, not a reason to claim the text is a checked PDF.

Both modes retain fact grounding, ownership qualifiers, Not claimed exclusions and honest requirements-gap reporting.

## 1. Inputs

- **Workspace**: find `trajectory.md` in the current folder or a parent, and read `facts.md`. With no workspace, the facts are whatever the user gave you in this conversation: treat those notes as the fact file.
- **The posting and its evaluation**: use `applications/<folder>/evaluation.md` when available; its requirements table is the checklist here. For a text-only request without an application folder, compare the supplied posting and facts in context, without creating a workspace. Otherwise, if no evaluation exists, load the `evaluate` skill with your skill tool and run it first.

## 2. Draft from the facts

For PDF delivery, write `cv.md` in the application folder (format below). For text only, draft the requested material in the reply or the file the user named. Choose and order facts for this posting.

Start each bullet from the fact file, before adapting it to the posting:
1. Select the supporting fact-file lines. Carry over their action, explicitly named objects, collaborators, ownership, scope and outcomes. Leave unspecified details unstated.
2. Form the shortest complete statement of those facts, then tighten or reorder it for the posting. The posting chooses emphasis, not additional claims.

- **The verb comes from the fact.** "Led", "owned", "drove", "architected", or "designed" only where the fact says the candidate did that; "with one other engineer" stays in. "Deployed to a platform another team ran" stays that only when the source fact explicitly says the other team ran it.
- **Numbers and outcomes come from the fact.** A number, a result ("which cut incidents"), or a scale ("customer-facing", "company-wide") appears only as the fact records it. Where a bullet would be stronger with a number the facts lack, ask the user for it; don't estimate.
- **Wording is yours**: tighten, reorder, lead with what the posting values, and use the posting's term where a fact supports it (a synonym match, not a new claim).
- A fact under **Not claimed** in `facts.md` never appears, in any wording.

**Example.** Source fact: "Deployed onto a platform owned by another team, with one other engineer."
Bullet: "Worked with one other engineer to deploy onto another team's platform."

Owning and operating a platform, coordinating with its team, and following its procedures are separate claims. Each needs support in the facts. A named collaborator does not establish the total team size.

If the facts cannot support the requested number of distinct bullets, give the supported material and report the shortfall under **Left out**. Label alternative phrasings as alternatives rather than separate accomplishments.

If the user supplies a new fact while you draft, record it first as the `profile` skill's *Writing back* says, then use it.

When a cover letter is part of the requested output, `cover-letter.md` or its text follows the same rules: why this role, the two or three facts that answer the posting's main needs, and one honest sentence on the biggest gap if it's a stated requirement.

## 3. Render and check (PDF delivery only)

For text only, skip this step. Do not claim PDF readiness or ATS results from unrendered text.

For PDF delivery, run in the workspace, with this skill's folder as `<skill>`:

```
node <skill>/scripts/render.mjs applications/<folder>/cv.md [--paper a4]
node <skill>/scripts/ats-check.mjs applications/<folder>/cv.pdf --keywords "<requirement terms>" --sections "<your section headings>"
```

`render.mjs` needs Chrome, Edge, or Chromium; `ats-check.mjs` needs `pdftotext` (both print how to get them). Fix every error the check reports and re-run. A missing keyword is a finding, not an instruction: add it only where a fact supports it. Render the cover letter the same way.

## 4. Reply

Give the user, in this order:

```markdown
**Files:** <paths to requested PDF files, or the requested text/bullets>

**Requirements not met:** <each requirement from the evaluation with no supporting fact, and what the materials say instead (a bridge, or nothing)>. "None" only when every requirement is met.

**Left out:** <anything the user asked for that the facts don't support, and the fact that would let you add it>

**ATS check:** <PDF delivery: pages, errors fixed, keywords covered and missing. Text only: Not run; text-only output, no PDF/ATS verification claimed.>
```

The first two sections stay even when the user asked for only the final text: that reply is where they learn what the application doesn't cover before they send it.

**Done when**, in either mode, every claim in every bullet traces to the fact file or supplied facts and the reply has all four sections. For text only, the requested text is delivered and ATS is explicitly not run. For PDF delivery, the requested PDFs also exist and their ATS checks report no errors. Unmet requirements and unsupported requests remain visible in either mode.

## Format of cv.md

```markdown
# <Full name>
<email> · <phone> · <city>\
<one or two links>

## Summary
<two or three sentences for this posting>

## Experience
### <Title>, <Employer> | <Mon yyyy> - <Mon yyyy or Present>
- <bullet>

## Education
### <Degree>, <Institution> | <yyyy> - <yyyy>

## Skills
<comma-separated, grouped if long>
```

One column, plain section names, dates in `Mon yyyy - Mon yyyy` form: the template in `templates/cv.html` keeps the text layer clean, and `render.mjs` normalises date dashes.
