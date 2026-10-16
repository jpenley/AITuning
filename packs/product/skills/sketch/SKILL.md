---
name: sketch
description: "Use when a design question can't be settled on paper and needs a throwaway prototype: whether a state model or business logic feels right, or what a UI should look like (mock up layouts or designs to compare), before building it for real."
---

# Sketch

A sketch is **throwaway code that answers one question**. The question decides the shape.

## Pick a branch

Identify the question from the request and the surrounding code, or ask if the user is around:

- **"Does this logic or state model feel right?"** → [LOGIC.md](LOGIC.md): one self-contained HTML file with free-play buttons and guided scenarios, driving a pure logic module a non-developer can explore.
- **"What should this look like?"** → [UI.md](UI.md): several structurally different UI variants on one page, switchable from a floating bar.

The two produce very different artifacts, so a wrong branch wastes the whole sketch. If the question is genuinely ambiguous and the user isn't reachable, pick the branch that matches the surrounding code (a backend module → logic; a page or component → UI) and state that assumption at the top of the sketch.

## Rules for both

1. **Throwaway, and marked as such.** Put it close to where it will be used, but name it so a casual reader sees it's a sketch, not production. Follow the project's existing routing and folder conventions.
2. **Trivial to run.** A UI sketch starts with one command from the project's usual task runner; a logic sketch is a file you double-click.
3. **No persistence by default.** State lives in memory. If the question is *about* persistence, use a scratch database or file clearly named for wiping.
4. **Skip the polish.** No tests, no error handling beyond what makes it run, no abstractions.
5. **Show the state.** After every action (logic) or variant switch (UI), render the full relevant state so the user sees what changed.
6. **Capture it when done.** Fold the validated decision into the real code, then commit the sketch to a throwaway `sketch/<name>` branch, out of main, and leave a pointer to that branch on the ticket or spec. Record the answer too: the question it settled and the verdict. Main keeps only the decision.
