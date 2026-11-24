# UI sketch

Several **structurally different UI variants** on one page, switchable from a floating bar. The user flips between them, picks one (or takes parts of several), and the rest are thrown away.

## Where the variants live

**Prefer an existing page.** Variants judged inside the real app (real header, navigation, data, and density) reveal problems that an empty page hides. Render them on the existing route, selected by a `?variant=` query parameter; existing data loading, parameters, and auth stay as they are, and only the rendered part swaps. Something that doesn't have a page yet but would naturally live inside one (a new section, card, or step) still goes inside that host page.

**A new page only as a last resort**, when there's genuinely nowhere to embed it. Follow the project's routing convention, name it so it's obviously a sketch (for example `sketch` in the path), and use the same `?variant=` switch.

## 1. State the question and pick how many

Default to **3 variants**; more than 5 stop being radically different. Write the plan in one line where the sketch lives: "Three variants of the settings page, switched by `?variant=`, on the existing settings route."

Then write a short **design contract** every variant must meet, so they're comparable:

- **The screen's job**: what the user comes here to do.
- **The primary action**.
- **Required states**: loading, empty, error, and success, each designed rather than left blank.
- **Responsive rules**: what changes at narrow widths.
- **Patterns to reject** (see below).

## 2. Make the variants differ in structure, not style

**Match the project's existing look**: its design system, component library, colours, typography, and spacing, unless the user explicitly asks for something different. The variants should disagree about **structure**: layout, information hierarchy, the primary action and where it sits. Three tweaks of the same card grid aren't a sketch; if two drafts come out too similar, redo one with an explicit structural constraint ("no card grid").

**When there's no existing style to match**, or the user asks for new looks, name the specific default patterns to avoid instead of asking for "no generic look" (a general instruction just swaps one default for another). If the design pack is installed, load the `craft` skill with your skill tool: its list of generic-look tells is the one to avoid. Otherwise start from the usual model defaults below and add whichever ones the first variants fell into:

- purple or indigo everywhere; heavy gradients; cream or off-white backgrounds
- maximum corner rounding; pill-shaped buttons; heavy layered shadows
- generic hero sections; stock card grids; oversized uniform padding
- numbered "01 / 02 / 03" section labels; italic accent words in headlines; monospace labels
- lorem-ipsum text (use realistic content: its length and wrapping expose layout problems)

Give each variant a clear component or partial name (`VariantA`, `VariantB`, ...).

## 3. Wire them together

One switch on the page chooses the variant from `?variant=` and renders it. Adapt this to the project's framework:

- **Razor Pages / MVC**: read the query value in the page model or controller; render a partial per variant.
- **Blazor**: bind the query value with `[SupplyParameterFromQuery]`; render a component per variant.
- **React and similar**: read the search parameter; render a component per variant.

Data loading stays above the switch; only the rendered part changes.

## 4. The floating switcher

A small fixed bar at the bottom centre:

- **Previous / next** buttons that cycle through variants (wrapping around), updating the query parameter so the choice is shareable and survives a reload.
- **The current variant's key and name**, for example `B (Sidebar layout)`.
- **Left and right arrow keys** also cycle, except while a text input, text area, or editable element has focus.
- Visually distinct from the page, so it's obviously not part of the design.
- **Never shipped**: render it only in development builds (the framework's environment check).

## 5. Hand it over

Give the user the URL and the variant keys. The useful feedback is usually "the header from B with the sidebar from C": that combination is the real design.

## 6. Capture and clean up

Record which variant won and why. Rewrite the winner properly in the real code, with the `compose` skill when the design pack is installed: sketch code was written without tests or error handling, so it isn't promoted. The other variants and the switcher go to the throwaway branch.
