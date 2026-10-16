---
name: tailor
description: Use when writing or rewriting a CV, résumé, experience bullets, or cover letter for a specific role, making application materials match a vacancy's requirements or keywords, producing the application PDF, or checking that a CV parses in applicant tracking systems.
---

# Tailor

Writes the CV and cover letter for one posting from the candidate's fact file, renders them to PDF, and checks the PDF the way an applicant tracking system reads it.

## 1. Inputs

- **Workspace**: find `trajectory.md` in the current folder or a parent, and read `facts.md`. With no workspace, the facts are whatever the user gave you in this conversation: treat those notes as the fact file.
- **The posting and its evaluation**: `applications/<folder>/evaluation.md`. If there's none, load the `evaluate` skill with your skill tool and run it first: its requirements table is the checklist here.

## 2. Draft from the facts

Write `cv.md` in the application folder (format below), choosing and ordering facts for this posting. Each bullet is built from one or more lines of the fact file:

- **The verb comes from the fact.** "Led", "owned", "drove", "architected", or "designed" only where the fact says the candidate did that; "with one other engineer" stays in; "deployed to a platform another team ran" stays that.
- **Numbers and outcomes come from the fact.** A number, a result ("which cut incidents"), or a scale ("customer-facing", "company-wide") appears only as the fact records it. Where a bullet would be stronger with a number the facts lack, ask the user for it; don't estimate.
- **Wording is yours**: tighten, reorder, lead with what the posting values, and use the posting's term where a fact supports it (a synonym match, not a new claim).
- A fact under **Not claimed** in `facts.md` never appears, in any wording.

If the user supplies a new fact while you draft, record it first as the `profile` skill's *Writing back* says, then use it.

The cover letter (`cover-letter.md`) follows the same rules: why this role, the two or three facts that answer the posting's main needs, and one honest sentence on the biggest gap if it's a stated requirement.

## 3. Render and check

Run in the workspace, with this skill's folder as `<skill>`:

```
node <skill>/scripts/render.mjs applications/<folder>/cv.md [--paper a4]
node <skill>/scripts/ats-check.mjs applications/<folder>/cv.pdf --keywords "<requirement terms>" --sections "<your section headings>"
```

`render.mjs` needs Chrome, Edge, or Chromium; `ats-check.mjs` needs `pdftotext` (both print how to get them). Fix every error the check reports and re-run. A missing keyword is a finding, not an instruction: add it only where a fact supports it. Render the cover letter the same way.

## 4. Reply

Give the user, in this order:

```markdown
**Files:** <paths to cv.pdf and cover-letter.pdf, or the bullets if they asked only for bullets>

**Requirements not met:** <each requirement from the evaluation with no supporting fact, and what the materials say instead (a bridge, or nothing)>. "None" only when every requirement is met.

**Left out:** <anything the user asked for that the facts don't support, and the fact that would let you add it>

**ATS check:** <pages, errors fixed, keywords covered and missing>
```

The first two sections stay even when the user asked for only the final text: that reply is where they learn what the application doesn't cover before they send it.

**Done when** the PDFs exist, the ATS check reports no errors, every bullet traces to `facts.md`, and the reply has all four sections.

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
