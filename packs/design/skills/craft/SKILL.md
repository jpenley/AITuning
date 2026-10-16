---
name: craft
description: Use when writing or changing the markup, styles, or layout of a page, screen, or component (HTML, CSS, templates, email), or checking a page's accessibility, contrast, text size, tap targets, motion, or generic AI-made look.
---

# Craft

The quality floor for any interface you touch, and the tools that check it on the rendered page. The floor holds only what is checkable and near-universal; style (fonts, palette, shape, voice) belongs to the project's `DESIGN.md`, and where it has one, it wins.

## 1. Before editing

- Read the project's `DESIGN.md` (or its tokens file) if there is one, and use its tokens rather than new values. With none, and you're adding more than a component, set a small token set in `:root` first (neutrals, one accent, a type scale, a spacing scale) and mention the `codify` skill to the user.
- Name the surface's **mode** in one line, because it sets density and restraint: **Persuade** (marketing, landing), **Operate** (tools, dashboards, admin: dense, calm, no decoration), **Read** (docs, articles: measure and rhythm), **Experience** (games, product demos: motion carries meaning).

## 2. The floor

| Area | Floor |
|---|---|
| Contrast | Text 4.5:1; large text (24px, or 18.66px bold) 3:1; control boundaries, icons, and focus rings 3:1. Check muted greys and white text on mid-tone buttons (Tailwind's indigo-500 with white is 4.47:1) |
| Text size | Reading text 16px preferred, 12px minimum; labels and badges 11px minimum |
| Type | One scale of 6–8 sizes from a ratio (about 1.2 for product UI, up to 1.333 for marketing). Line-height 1.4–1.7 for body, 1.05–1.2 for display. Line length 45–75ch |
| Spacing | A 4px-based scale; more space above a heading than below it |
| Colour | Neutrals carry most of the surface, one accent carries the actions; status colours only for status |
| States | Every control: default, hover, focus-visible, active, disabled; every data view: loading, empty, error |
| Layout | No sideways scroll at 390px wide; tap targets 24×24px minimum (44 comfortable); `100dvh`/`svh` instead of `100vh` |
| Motion | Transform and opacity only; durations by job as in the `animate` skill's table; ease-out; a `prefers-reduced-motion` path; content visible if the script never runs |

For web surfaces with forms, navigation, asynchronous feedback, gestures, media, locale formatting, or themes, read [INTERACTIONS.md](INTERACTIONS.md) and check the applicable rows alongside the floor.

## 3. Check the rendered page

With the page running (a dev-server URL) or as an HTML file, run from this skill's folder:

```
node scripts/detect.mjs <url|file.html> [--tokens DESIGN.md]
node scripts/shoot.mjs <url|file.html>
```

`detect.mjs` measures the page at 1280px and 390px and reports **errors** (the floor is broken), **warnings** (likely wrong), and **tells** (patterns common in AI-made interfaces). For a page that shows content people type or translate (names, tables, labels), add `--stress`: it re-measures with longer text and right-to-left, and reports what spills, clips, or scrolls sideways. `shoot.mjs` saves full-page screenshots at both widths; look at them. Both need Chrome, Edge, or Chromium and print how to point at one.

- Fix every error.
- For each tell, change it or keep it and say why: a tell is a reason to look again, not a ban. The common ones: rows of identical icon-plus-heading cards, a small uppercase label above every section heading, a blue-to-purple gradient or Tailwind's default indigo as the accent, emoji as icons, gradient text, rounded cards with a coloured left border, a decorative pulsing dot, small `a · b · c` meta strings, calls to action ending in an arrow, stock marketing words and em dashes in the copy, invented metrics, logos, or testimonials, and placeholder names.
- Budget: one round of fixes, then one re-check. What's still open after that goes to the user with the findings, not into more rounds.

Without a browser or a way to render the page, check the floor by reading the CSS against the table above, and say the page wasn't measured.

**Done when** `detect.mjs` reports no errors at both widths (or the user has the open ones), every tell is changed or kept with a reason, you've looked at both screenshots, and each applicable interaction row has evidence or is reported as unverified.
