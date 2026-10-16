# Web interaction checks

Use the rows that match the surface. For each applicable row, record the element or `file:line`, evidence, and a fix or an unverified check. Read code for implementation evidence; exercise the real user path to establish behavior. A clean detector and screenshots establish only the states they examined.

| Surface | Check |
|---|---|
| Forms | Paste and autofill work. Submission shows progress and prevents duplicate requests. Errors identify fields, explain recovery, and focus the first invalid field. |
| Async feedback | Saving, failure, and success are perceivable without sight through appropriate status/error announcements. |
| Navigation and drafts | Shareable filters, tabs, and pagination survive reload and Back. Unsaved edits have protection or recovery. Keep transient menu state local. |
| Keyboard and gestures | Check keyboard traversal, dialog focus containment and return, and focus visibility beneath sticky chrome. Provide click/tap and keyboard alternatives to dragging. |
| Images and loading | Reserve image space; defer offscreen images and prioritize the critical image. Measure list/rendering cost before prescribing virtualization. |
| Locale and hydration | Format dates and numbers for the intended locale. Verify server/client output agrees across time zones without suppression comments. |
| Mobile overlays | Check safe-area insets, drawer scroll containment, and focused controls with the on-screen keyboard open. |
| Dark themes | Check native inputs/selects, browser chrome, and the document color scheme. |

Use project conventions for capitalization and copy. Prefer native elements with their built-in keyboard behavior. Apply autofill settings to each field's purpose.

Report supported defects separately from checks that could not run. A screenshot review can leave interaction rows unverified; name those rows instead of claiming a complete pass. In `craft`, include this work within the existing fix/re-check budget. In `critique`, grade findings using its existing report.

Source: ideas re-expressed from [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md), [MIT](https://github.com/vercel-labs/web-interface-guidelines/blob/main/LICENSE), Copyright (c) 2025 Vercel Labs.
