# Template: DESIGN.md

Copy everything below the line into the project's `DESIGN.md`. Replace every `<...>`; delete a section only when the product truly has none of it.

---

# <Product> design system

<One paragraph: what the product is, who uses it, and the feeling it should have, in the product's own terms.>

**Mode:** <Persuade | Operate | Read | Experience>, <one line on what that means here: density, restraint, where motion is allowed>.

Tokens live in `<tokens.css or theme file>`; this file and that one agree value for value.

## Colour

| Token | Value | Use | Contrast |
|---|---|---|---|
| `text` | <#hex> | body text | <n>:1 on `surface` |
| `text-muted` | <#hex> | secondary text | <n>:1 on `surface` |
| `surface` | <#hex> | page background | |
| `surface-raised` | <#hex> | cards, menus | |
| `border` | <#hex> | dividers, control outlines | <n>:1 on `surface` (3:1 for controls) |
| `accent` | <#hex> | primary actions, links | <n>:1 on `surface` |
| `on-accent` | <#hex> | text on `accent` | <n>:1 on `accent` |
| `danger` / `success` / `warning` | <#hex> | status only | <n>:1 |

<Dark theme, if any: the same table for it.>

## Type

- Display font: <family>, <fallback stack>
- Text font: <family>, <fallback stack>
- Mono font: <family>, <fallback stack>, if used

| Step | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| `display` | <px/rem> | <1.05–1.2> | | page titles |
| `h1`–`h3` | | | | |
| `body` | <16px+> | <1.5–1.7> | | reading text |
| `small` | <≥12px> | | | captions, help text |
| `label` | <≥11px> | | | badges, table headers |

Line length: <max-width in ch> for reading text.

## Space, shape, depth

- Spacing scale: <4, 8, 12, 16, 24, 32, 48, 64…>
- Radii: <e.g. 4px controls, 8px cards, full for pills>
- Borders: <widths and when>
- Shadows: <each level and where it's used>
- Layout: <max content widths, breakpoints, grid>

## Components

<For each core control (button, input, select, link, card, table, dialog): its variants and how default, hover, focus-visible, active, disabled, loading, and error look. The focus style is stated explicitly.>

## Motion

- Durations: <the `animate` skill's table, plus this product's departures from it>
- Easing: <entrance curve, exit curve>
- Where motion is used here, and where it isn't.
- Reduced motion: <what changes under prefers-reduced-motion>

## Voice and imagery

<How copy sounds; illustration, photo, and icon style; the icon set used.>

## This product's do's and don'ts

<Specific to this brand, each with its reason. Not general craft rules: those live in the craft skill.>
