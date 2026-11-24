---
name: consult
description: Use when you need a decision from the user whose options each take more than a line to explain or would be clearer with a diagram, image, or example, when three or more related questions belong together, or when the user asks to answer in the browser or on a page. For one or two short questions, use your structured question tool instead.
---

# Consult

Asks the user through a local web page instead of the terminal. Each question can explain itself with markdown, a Mermaid diagram, images, or a sandboxed HTML illustration. The user answers with radio buttons, checkboxes, and text. The script exits when the session ends and prints one answer object, so running it as a background command wakes you with the answers.

With this skill's folder as `<skill>`, the script is `node <skill>/scripts/consult.mjs` (Node 24 or later, no packages).

## 1. Choose the channel

| The decision | Channel |
|---|---|
| One or two questions whose options fit on one line each | Your structured question tool, or plain chat |
| Options whose consequences need a paragraph, a diagram, or an example | Consult |
| Three or more related questions, or follow-ups that depend on an earlier answer | Consult |
| The user asked to answer in the browser | Consult |

Consult needs a browser on the user's machine. When the user can't open a local page (a cloud or web session, or a remote shell without port forwarding), ask in chat instead.

## 2. Write the spec

Write the spec as JSON in a scratch or temporary folder, outside the repository, as `<slug>.consult.json`. Put any images in the same folder. [SPEC.md](SPEC.md) is the format: read it before writing your first spec in a session.

A spec the user can answer quickly:

- **One decision per question.** The prompt is the question itself, ending in a question mark.
- **Context says what the decision changes**, in two to four sentences: what happens next with the answer, and the constraint that makes it hard.
- **Each option's `detail` states its consequence**: what choosing it does, costs, and rules out. A detail that restates the label tells the user nothing.
- **Recommend when you have a position.** Mark one option `recommended` with a `why` that names the evidence that would change it.
- **Show structure as a diagram.** Use `mermaid` for flows, sequences, and dependencies, and `images` for screenshots. Use `html` for what those can't show, such as a small rendered example. It runs sandboxed and can't read or change the answers.
- **`allowOther: true`** unless the options are exhaustive.
- **`showIf`** for a follow-up that only matters after a particular answer; **`pages`** when there are more than about four questions.

Then validate:

```
node <skill>/scripts/consult.mjs check <spec>
```

Fix every listed problem and check again until it prints `"status": "valid"`.

## 3. Start the session in the background

```
node <skill>/scripts/consult.mjs serve <spec>
```

Run it as a background command (in Claude Code, Bash with `run_in_background`). It opens the page in the default browser and prints the URL on stderr. Tell the user in one line that the page is open and what it asks; when the browser can't open on its own (a remote shell), give them the URL from the output.

Then end your turn. The harness wakes you when the process exits. Proceed only on the answer object: polling the output, sleeping, or guessing the answers while the page is open all act on answers the user hasn't given.

Where your harness has no background commands, run it in the foreground with a timeout longer than the user needs, and pass `--timeout <seconds>` so the session ends first.

## 4. Act on the answer

When the process exits, read `<spec minus .json>.answer.json`: stdout holds the same object, but background output can interleave the stderr status lines. The exit code and `status` agree. Your harness may show exit codes 2 to 4 as a failed command; that is expected.

| Status (exit) | Meaning | Next step |
|---|---|---|
| `submitted` (0) | Every required question is answered | Apply the answers |
| `cancelled` (2) | The user declined | Ask in chat what they want instead; don't reopen the same page |
| `closed` (3) | The tab closed, or never opened | Ask in chat whether to reopen it or continue in chat |
| `timeout` (4) | `--timeout` passed | As for `closed` |
| `error` (1) | Invalid spec, or the server couldn't start | Fix the listed `problems` and start again; if it can't serve, ask in chat |

For `cancelled`, `closed`, and `timeout`, `answers` holds what the user had filled in so far. Treat it as a draft to confirm, not as decisions.

Reading a `submitted` answer:

- `selected` holds the chosen options' ids and labels; `other` is the user's own answer in place of, or beside, the options.
- `note` qualifies the answer. Carry it with the decision ("Redis, if the sessions cluster has headroom").
- `followedRecommendation: false` means the user chose differently from your recommendation. Their choice stands; follow up only if the note leaves a real gap.
- `answered: false` on an optional question means the user skipped it. Don't fill it in from your recommendation.

Restate the decisions to the user in a few lines, then continue the work. Record any decision that must outlive the conversation where the project keeps decisions (a spec, ticket, or ADR); the answer file sits in a scratch folder and is not a record.

**Done when** every answered question is applied or recorded, and any status other than `submitted` has been resolved with the user in chat.
