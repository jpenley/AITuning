# Logic sketch

One self-contained HTML file that lets anyone drive a state model by clicking buttons. For questions about **business logic, state transitions, or data shape**: the things that look fine on paper and feel wrong once pushed through real cases. Because it's one file with nothing to install, it can go to a designer, product owner, or domain expert, so it speaks their language, not the code's.

## 1. State the question

Write the state model and the question being tested as one paragraph, visible at the top of the page (not just a code comment), so anyone returning to it can check it answered the right question.

## 2. Isolate the logic in a portable module

Put the logic that answers the question in one `<script>` block, written as a small pure module that could be lifted into the real codebase. Pick the shape the question needs:

- **A pure reducer** `(state, action) => state`: discrete events, single state value.
- **A state machine**: explicit states and transitions, when "which actions are legal right now" is part of the question.
- **Pure functions over a plain data type**: transformations with no current state.
- **A small class with a clear method surface**: when the logic genuinely owns ongoing state.

Keep it pure: no DOM, no `document`, no handlers reaching inside. The page calls into the module; nothing flows back. That is what lets the validated module move into the real code afterwards.

## 3. Build the page

Plain HTML, CSS, and JavaScript inline in one file: no framework, bundler, or server, so it opens by double-click and survives being emailed. Label everything in **domain language**. Top to bottom:

1. **Title and one line** on what the page lets you explore.
2. **Current state** as a readable panel (labelled fields, not raw JSON), re-rendered after every click, calling out what just changed.
3. **Free-play buttons**: one per action, always available.
4. **Guided scenarios**, one per tab: a plain-language description of the situation and what to watch for, then the ordered buttons to press, each a real button that performs its step. Starting a scenario resets to a known state. Choose the cases that are hard to reason about on paper: the normal path, a tricky edge case, an attempt at something that should be illegal.

Keep it clean and restrained: readable type, generous spacing, one accent colour, no animation.

## 4. Hand it over

Give the user the file path, or open it for them. The valuable moments are "wait, that shouldn't be possible" and "I assumed X would be different": bugs in the *idea*. Add actions or scenarios as they ask. To share it with someone outside the repo, send the file itself, or publish it where your harness offers private sharing.

## 5. Capture

The validated module lifts into the real code as it is; the HTML shell stays re-runnable on the throwaway branch.
