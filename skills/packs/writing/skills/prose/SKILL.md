---
name: prose
description: Use when writing (including from notes), editing, or reviewing long-form text people read, either documentation (a README, plan, spec, ticket, docs page, how-to, tutorial, reference, explanation, release notes, changelog, or error help) or personal writing (a post, newsletter, essay, letter, announcement, long email, or report); when the user asks to make docs clearer or that writing stop sounding like AI wrote it; or asked whether text is AI slop. A PR body goes to `pr`.
---

# Prose

Long-form text people read, written or edited so it doesn't read as machine-made. Adapted from poteto-mode's `technical-writing` (cursor/plugins, MIT). Agent instructions (skills, `AGENTS.md`, prompts) follow the `tune` skill; plans and specs keep their workflow templates while these steps govern their wording; PR bodies follow the `pr` skill, with steps 2 to 5 below applied to their sentences.

Pick the job first:

- **Documentation** (a README, plan, spec, ticket, docs page, how-to, tutorial, reference, explanation, release notes, changelog, or error message's help text): steps 1 to 5 below, so a tired engineer understands it on the first read.
- **Personal or opinion writing** (a post, newsletter, essay, letter, announcement, long email, or report), and **editing a draft someone else wrote**, of any kind: read [VOICE.md](VOICE.md) and follow its edit mode. A documentation draft gets steps 1 to 5 as well.
- **Checking whether text reads as AI-written** ("is this AI slop?"): [VOICE.md](VOICE.md)'s detect mode.

The linter in step 5 applies to every job.

Two rules sit above the documentation steps:

- **Every word does work.** A word the sentence survives without goes. "In order to" is "to"; "it is important to note that" is nothing.
- **The reader beats the rule.** When a rule makes a sentence worse, fix the sentence another way. Text that obeys every rule and sounds machine-written has failed: mix short sentences that land a point with longer ones that carry a fact and its condition, and say what you make of a trade-off where the mode allows a view.

Write the real symbol, file, flag, or command, never a synonym for it.

**Protect meaning before style.** Preserve code, commands, paths, identifiers, configuration keys, URLs, logs, error text, and quoted technical literals. Keep qualifiers that change scope or certainty, such as `partially`, `approximately`, `concurrently`, `likely`, and `most`. Preserve precise domain terms and passive wording when the actor is unknown or the outcome is the subject. Reject an edit that changes a claim's ownership, chronology, causality, scope, or certainty. Lint findings are review signals; apply a rewrite only when it preserves these meanings.

For a plan, spec, or ticket, preserve the owning workflow's template: field labels, IDs, dependencies, status, acceptance criteria, and verification commands. Apply these writing steps within that structure.

## 1. Pick the mode

One document, one mode (Diátaxis). Two questions pick it: does it serve action or understanding, and learning or work?

| | Learning | Work |
|---|---|---|
| **Action** | **Tutorial**: you teach. Say what the reader will build; every step shows a visible result. | **How-to**: steps to a goal the reader already has. Assume competence; no background, no teaching. |
| **Understanding** | **Explanation**: why it is the way it is: decisions, constraints, alternatives. One bounded topic. | **Reference**: facts for lookup: options, limits, errors, exit codes. Dry, complete, sure; structured like the thing it describes. |

Material from another mode moves to its own page or section and gets a link: background leaves a how-to, and a reference table leaves a tutorial.

**Done when** you can name the mode of every section, and each section holds only its mode.

## 2. Write to the reader

- Address the reader as "you", in the present tense.
- Name who acts: "the CLI revokes the old key", not "the old key is revoked".
- Instructions are commands: "Run `acme keys list`."
- **The condition comes before the instruction**: "To keep CI running, update the secret before the grace period ends."
- The common case first, exceptions after.
- A heading carries the point ("Update CI before the old key expires"), in sentence case. A task heading is a verb phrase; a concept heading is a noun phrase.
- Numbered lists for sequences, bullets for the rest, each introduced by a full sentence and kept parallel.
- Code, commands, paths, and flags in code font. Link text says where the link goes.

**Done when** every instruction is a command with its condition first, and every heading could stand alone as a summary of its section.

## 3. Load one thing at a time

- One instruction per sentence; one thought per sentence elsewhere.
- Split an instruction longer than about 20 words, and any other sentence longer than about 25.
- A warning comes before the step it guards: "If you pass `--force`, the old key stops working at once."
- Keep "the" and "a": "remove the backup file", not "remove backup file".
- One word per meaning, one meaning per word. If "check" means inspect, it never also means restrain.

**Done when** no sentence carries two instructions and no warning trails its step.

## 4. Leave no second reading

- Keep "only" and "not" next to the word they change.
- Break noun stacks: "the key rotation grace period check" becomes "the check on the rotation's grace period".
- Every "it", "they", and "this" points at one obvious noun; repeat the noun when in doubt.
- Periods over semicolons and em dashes. Text in parentheses is a whole phrase or its own sentence. "A, b, or both" over "a/b".
- Plain words over idioms, Latin abbreviations, and metaphors: a translator and a non-native reader parse them first.

**Done when** each sentence parses one way.

## 5. Lint

Run `node scripts/lint-prose.mjs <file>` (in this skill's folder) on the document. It flags the mechanical tells, among them AI vocabulary, filler, stacked hedges, chatbot phrases, curly quotes, em dashes, title-case headings, and plain-word swaps, each with a line and a suggested fix. Code blocks and inline code are ignored. A project can switch off its taste rules in `.prose-lint.json`.

Fix each finding, or leave it and say why it stays.

**Done when** the linter exits 0, or every remaining finding has a reason.

## Example

Before:

> Configuration of the key rotation grace period is performed via the `--grace` flag. Note that it's important to remember that CI secrets should be updated, which is required before expiry, otherwise failures occur.

After:

> Set how long the old key keeps working with `--grace` (default `24h`, at most `7d`). Update your CI secrets before that time ends, or CI jobs fail with 401.

## Sources

Diátaxis (diataxis.fr), the Google developer documentation style guide (developers.google.com/style), ASD-STE100 Simplified Technical English (Issue 9, 2025), and Kohl's *The Global English Style Guide*, as distilled in poteto-mode's `technical-writing` skill.
