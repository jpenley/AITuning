---
name: codify
description: Use when a project needs a design system, style guide, or DESIGN.md, when extracting design tokens (colours, type, spacing, radii) from an existing interface, when defining a brand's visual rules for agents to follow, or when checking code for drift from the design tokens.
---

# Codify

Writes the project's `DESIGN.md` and matching tokens file: the one place its visual style is decided, which `compose`, `critique`, and `animate` follow and `craft`'s detector checks against. It records this product's choices; the craft floor stays out of it (that lives in the `craft` skill).

## 1. Gather

- **From an existing interface**: run the detector's inventory on the two or three most representative pages (the `craft` skill's folder is beside this one):
  ```
  node <this skill's folder>/../craft/scripts/detect.mjs <url|file.html> --inventory
  ```
  It lists every colour, font family, font size, and radius the page renders, with counts. Read the existing CSS custom properties or theme config too (`:root` variables, `tailwind.config`, a theme object): where they exist, they are the tokens' names.
- **For a new product**: ask the user, one question at a time, for what exists (logo, brand colours, a font already licensed, products they want it to feel like, products it must not look like). Everything else you propose; nothing is presented as their brand until they agree.

## 2. Consolidate

- Merge near-duplicates (two greys a few steps apart become one) and name tokens by **role**, not appearance: `text`, `text-muted`, `surface`, `surface-raised`, `border`, `accent`, `on-accent`, `danger`, and so on.
- Type: each size with its line-height and use, on `craft`'s scale rules. Spacing on `craft`'s 4px scale; two or three radii; the shadows actually used.
- **Check every text and background pairing** the tokens allow, and write the ratio next to it. A pairing below `craft`'s contrast floor is either fixed now or marked "large text only".

## 3. Write

Write `DESIGN.md` from [TEMPLATE.md](TEMPLATE.md) and a tokens file in the project's format (CSS custom properties in `tokens.css` by default, or the existing theme config). The two agree value for value.

## 4. Check for drift

```
node <this skill's folder>/../craft/scripts/detect.mjs <url|file.html> --tokens DESIGN.md
```

It reports each colour and font family used on the page that isn't in the tokens. Give the user the drift list with the nearest token for each; replace values in code only when they ask.

**Done when** `DESIGN.md` and the tokens file exist and agree, every allowed text/background pairing has its contrast ratio written down, and the drift check has run on the main pages.
