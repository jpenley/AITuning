---
name: compose
description: Use when building a new page, screen, or component's look, restyling or redesigning an existing page or app, making a UI look better or less generic, or turning a brief or wireframe into a finished page.
---

# Compose

Builds or restyles an interface so it serves its purpose, holds the craft floor, and looks like this product rather than a template. Load the `craft` skill with your skill tool first: its floor and its checks apply throughout.

## 1. Read before designing

Read the brief, the project's `DESIGN.md` and existing components, and the content the page has to carry. Write a one-line **design read** for yourself: the mode (Persuade, Operate, Read, Experience), who uses it and on what device, and what they must do or understand first. Ask the user at most one question, and only when its answer changes the structure (not the colours).

## 2. Structure from the content

Decide the hierarchy before any styling: what the eye should land on first, second, third, and what each section is for. Let the content choose each section's layout: a comparison is a table, a sequence is steps, three features of unequal weight are not three equal cards. For Operate surfaces, density and scannability come first: no hero, no decorative imagery.

Use only what the user gave you as facts. Where the page wants proof (customer counts, logos, testimonials, metrics) and none was supplied, leave a clearly marked slot, never an invented figure.

## 3. Build with the system

Use the `DESIGN.md` tokens. With none, define them in `:root` first as `craft`'s step 1 says, held to its floor (contrast, type scale, spacing), and build only from them.

When the interface needs generated raster imagery (photos, illustrations, textures or cutouts), load the `image-assets` skill with your skill tool. Save the selected assets in the project and use those files in the interface. Keep existing vector assets editable.

Restyling an existing page: change how it looks, not what it says or where it goes. URLs, navigation labels, form field names, and legal or pricing copy stay as they are unless the user asked to change them.

## 4. Check and report

Run `craft`'s check (its step 3) on the rendered page at both widths, with `--tokens` when there's a `DESIGN.md`. Then tell the user:

```markdown
**Design read:** <mode, audience, the first thing the page must get across>
**Built:** <files, and the sections or components in them>
**Check:** <detect.mjs errors fixed, and any still open>; screenshots at <paths>
**Tells kept:** <each tell kept and why, or "none">
**Needs from you:** <slots left for real proof, copy, or assets, or "nothing">
```

**Done when** the check has run (or the reply says why it couldn't), and the report has all five lines.
