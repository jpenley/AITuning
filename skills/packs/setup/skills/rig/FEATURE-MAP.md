# Feature map format

The feature map is `docs/agents/rig/features/`: a `README.md` index and one file per user-facing feature. It is the project's maintained source for proving behaviour. A proof that drives one convenient entry point is incomplete when the map lists others.

## The index: `features/README.md`

An H1 naming the app, one line saying what the directory is, then these sections in order:

1. **Baseline preconditions**: the state every recipe starts from: an instance started by the rig's Launch, on its own port and data directory, with named seed data, and Doctor passing.
2. **Driving conventions**: the handles to prefer (accessible roles and names, data attributes, prompt strings), commands taken literally, and seeded data restored after a mutation.
3. **Proof and skip reporting**: what counts as proof for each kind of surface, and how to report a path that couldn't be reached.
4. **Features**: one line per feature file, linked, saying what it covers.

## A feature file

An H1 title and one paragraph describing the behaviour as the user sees it, then exactly four H2 sections, in this order:

1. `Sub-features`: short IDs, one line each.
2. `How to get to it (user POV)`: every entry point a user has.
3. `Driving it with <harness>`: starts with `Preconditions:`, then labelled bullets, each pairing a user action with the exact command and the observable result. The last bullet is **Proof**: the artifacts to capture and where they go.
4. `Gotchas`: traps that waste or invalidate a run.

Name only user paths, stable handles, required state, commands, and observable proof; implementation detail belongs in the code.

## Worked example

A notes app with a browser UI and a `notes` CLI. Its rig ships one helper, `node docs/agents/rig/drive.mjs`, which runs browser actions against the rig's instance (`browser <action>`) and terminal commands with the rig's environment (`cli -- <command>`). Below, `drive` stands for that invocation. The index and one of its two feature files are shown.

`docs/agents/rig/features/README.md`:

```markdown
# Notes feature map

The maintained source for proving what Notes does for its users. Read this index before driving the app, then follow the matching feature file.

## Baseline preconditions

- Notes launched by the rig at `http://127.0.0.1:4173`, with `NOTES_DATA_DIR` set to this run's own directory.
- Seed notes titled `Quarterly plan` and `Grocery list`.
- `drive doctor` reports the expected URL, data directory, and build revision.
- Only an instance this run started is driven.

## Driving conventions

- Every recipe starts from the baseline state unless its preconditions say otherwise.
- Accessible roles and names over CSS selectors or DOM position.
- Commands are literal: quoted names and flags stay as written.
- Seeded data is restored after a mutation; proof artifacts are never removed.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof: an accessibility snapshot and a screenshot with the app's identity visible.
- CLI proof: the command, stdout, stderr, and exit code.
- Mutation proof: a second, read-only view of the stored value.
- Every artifact records the feature ID and the entry point used.
- An unreachable path is reported with the command tried and the unmet precondition, never as verified through a different path.

## Features

- [Create a note](./create-note.md): browser and CLI creation, cancelling a draft, persistence.
- [Search notes](./search.md): toolbar, keyboard, and CLI search, with matching, empty, and cleared states.
```

`docs/agents/rig/features/create-note.md`:

```markdown
# Create a note

A user saves a titled note from the browser or the CLI, can cancel an unfinished draft, and sees the saved note again from a second view.

## Sub-features

- `create-open` opens a blank editor from each browser entry point.
- `create-save` persists a title and body.
- `create-cancel` discards an unfinished browser draft.
- `create-cli` creates the same note from the terminal.

## How to get to it (user POV)

- Choose the `New note` button in the browser toolbar.
- Press `n` in the browser while focus is outside an editable field.
- Run `notes create --title <title> --body <body>` in a terminal.

## Driving it with drive.mjs

Preconditions:

- `drive doctor` passes.
- No note is titled `Release checklist`.

- **Open editor.** Choose `New note`: `drive browser click --role button --name "New note"`. A form named `Note editor` appears with focus in the `Title` textbox.
- **Enter content.** `drive browser fill --role textbox --name "Title" --value "Release checklist"` and `drive browser fill --role textbox --name "Body" --value "Tag and publish"`. The `Save note` button becomes enabled.
- **Save.** `drive browser click --role button --name "Save note"`. A status named `Note saved` appears and the heading reads `Release checklist`.
- **Persistence.** Return to the list and reopen the note: `drive browser click --role link --name "All notes"`, then `drive browser click --role link --name "Release checklist"`. The editor shows both saved values.
- **Cancel draft.** `drive browser click --role button --name "New note"`, `drive browser fill --role textbox --name "Title" --value "Discard me"`, `drive browser click --role button --name "Cancel"`. The list returns with no `Discard me` link.
- **CLI entry.** `drive cli -- notes create --title "CLI note" --body "Created from terminal" --format json`. Exit code 0; stdout holds the new note's ID and title.
- **Proof.** From `All notes`: `drive browser snapshot --aria --path .rig-evidence/<run>/create-note/list.aria.txt` and `drive browser screenshot --path .rig-evidence/<run>/create-note/list.png`. Both show `Release checklist` and `CLI note`.

## Gotchas

- Pressing `n` while a textbox has focus types the letter instead of opening an editor.
- Titles are trimmed on save: assert the rendered title, not the draft input.
- A `Note saved` status alone is not proof; reopen the note from the list.
- Remove `Release checklist` and `CLI note` when restoring the seed data; keep their proof artifacts.
```
