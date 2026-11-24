---
name: critique
description: Use when reviewing or critiquing how a page, screen, or mockup looks and works, giving visual feedback (layout, how usable and accessible it is), scoring its look, or getting a second opinion on a UI before launch.
---

# Critique

Reviews an interface the way a demanding design lead would: measured where it can be, specific everywhere, broken things before taste. Load the `craft` skill with your skill tool first: its floor is the first half of the checklist.

**Never critique work you made in this conversation**: you'll grade your intent, not the page. For your own work, hand the page and this skill to a fresh sub-agent; with no sub-agents, follow the `doubt` skill's no-sub-agent fallback and label the review **degraded (self-review)**.

## 1. Gather evidence

- Name the design's **stage** in one line. **Exploration** (a wireframe, grey boxes, placeholder copy, or the user calls it early): P0 and P1 are for structure, flow, and hierarchy, and P0 means "settle before styling"; floor findings that come only from the placeholder styling (its greys, its unstyled focus, lorem ipsum) go under P2 as notes to carry into the styled version. **Final** (launching, styled, or real copy): the full walk at the severities below.
- Run `craft`'s check on the rendered page (its step 3, including the no-browser fallback): the findings name the element, and the screenshots give both widths to look at.
- Read the `DESIGN.md` if there is one: departures from it are findings.
- Look at the screenshots at each width, then the code for states you can't see (hover, focus, disabled, error, empty, loading).
- For interactive web surfaces, use [craft's interaction checks](../craft/INTERACTIONS.md). Keep observed defects and unverified behavior distinct; include `file:line` when code supports a finding.

## 2. Look everywhere

Walk each area and note what you find, including "fine":

1. Works on a phone and zoomed (no sideways scroll at 320px, nothing clipped at 200% zoom, readable, tappable)
2. Contrast and text size, measured
3. Keyboard and focus, semantic structure (headings in order, labels, alt text)
4. Honesty (claims, metrics, logos, and testimonials the product can back)
5. Hierarchy (what the eye lands on first, and whether that's the right thing)
6. Type, spacing, and colour consistency against the scale and the tokens
7. States and motion (including what happens on the way out of a hover)
8. The generic look: each of `craft`'s tells present, named
9. Copy (does it say what the product does)

## 3. Report

```markdown
**Verdict:** <one sentence: ready, ready after the P0s, or not ready, and why>

**P0: fix before launch** (broken, inaccessible, or untrue)
- <element or selector>: <evidence: the measured value, the line, or what the screenshot shows> <the WCAG criterion, e.g. (WCAG 1.4.3), on an accessibility finding>. **Fix:** <the concrete change: the value, rule, or replacement text>

**P1: fix soon** (works but costs users)
- <same shape>

**P2: polish and taste** (the generic look, rhythm, copy tone)
- <same shape; for taste, the reason it matters here>

**Keep:** <what works and should survive the fixes>

**Not tested:** <the checks this review couldn't run; for accessibility, say that automated checks find only part of the issues, and whether a keyboard-only pass and a screen-reader pass were done>

**Score:** <only if asked: n/10, from the worst sustained problem, not an average of the good parts; one line on what would raise it>
```

Every finding names the element, shows the evidence, and states the change, with a value or replacement wherever one exists: "set `.card p` to #4b5563 (7.6:1 on white)", not "improve contrast". Everything the areas turned up goes in the report, graded; the reader filters by severity.

**Done when** all nine areas have been walked, every finding has its element, evidence, and fix, and the verdict matches the P0 list.
