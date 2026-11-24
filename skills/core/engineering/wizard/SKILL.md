---
name: wizard
description: Use when a procedure needs steps only a human can take (provisioning infrastructure, creating credentials or CI secrets, clicking through a third-party dashboard, running a one-off migration or cutover), instead of re-explaining those steps each time.
---

# Wizard

A **wizard** is a bash script that walks a person, stage by stage, through a manual procedure that's tedious to do by hand and tedious to re-explain to an agent. It opens each URL, says exactly what to click and copy, captures the values, writes them where they belong (`.env`, GitHub secrets and variables), confirms at every stage, and shows how many stages are left.

The experience is already built in [template.sh](template.sh): progress per stage, confirmation gates, cross-platform URL opening (macOS, Linux, WSL, and Git Bash on Windows through `explorer.exe`), hidden entry for secrets, repeat-safe `.env` updates, `gh secret` / `gh variable` writes, and a closing summary of the stages completed, values written, and anything left to do by hand. **Your job is only to scope the procedure and write its stages.** The library above the `STAGES` marker is identical in every wizard; leave it untouched.

If you could do a step yourself, do it: a wizard is only for steps where a human genuinely has to act.

A wizard is disposable by default: built for one run, saved to a scratch or `scripts/` path, deleted when the job is done. Commit it only when the user wants a repeatable setup path in the repo.

## 1. Scope the procedure

Work out every manual step and every value captured along the way. Read the repo before asking:

- **Setup**: `.env`, `.env.example`, `.env.*`, the README, `docker-compose*`, framework config, and CI workflows (every `secrets.*` / `vars.*` reference is a value the wizard must produce).
- **Migration or cutover**: the current state, the target state, and the irreversible actions between them.

Show the user the ordered stages and the values each produces, and confirm: they may add, drop, or reorder.

**Done when** every stage is named in order, and for each captured value you know (a) where the person gets it, (b) where it's written (`.env`, a GitHub secret or variable, several, or nowhere, since some stages are pure actions), (c) whether it's secret, and (d) for a credential, how to check it: its expected prefix and one cheap read-only call that only a valid value passes (an authenticated GET on the API it unlocks).

## 2. Map each stage's path

For each stage, write the exact path a person follows: which URL, what to do there, where the value appears, which variable it fills ("Dashboard → Developers → API keys → Reveal test key → copy"). Where you don't know the current UI or command, ask the user or check the docs: every step must exist.

**Done when** every stage traces to instructions a stranger could follow.

## 3. Write the wizard

Copy `template.sh` to the target path with **LF line endings** (a CRLF copy fails under bash). Replace the example stage with one `stage` per step, in dependency order, using the library helpers: `stage`, `say` / `step` / `note` / `warn`, `open_url`, `ask` / `ask_secret`, `ask_checked` with `expect_prefix` / `check_cmd`, `write_env`, `set_secret` / `set_var`, `pause` / `confirm`. Set `TOTAL_STAGES` to the number of stages.

Hold the template's bar: open the URL before asking for its value, capture every credential with `ask_checked` so a wrong paste is asked for again at its own stage, before anything later depends on it, use `ask_secret` for anything secret, `write_env` every value that persists, `set_secret` only the values CI actually needs, and `confirm` before any irreversible action. Each stage clears the screen, so keep a stage to one focused task.

## 4. Verify and hand off

- `bash -n <script>`, and `shellcheck` if it's available.
- `chmod +x <script>`.
- Don't run it end to end yourself: it opens browsers and waits for a person. Trace it instead: every value from step 1 is captured and lands where step 1 said, and every `set_secret` name matches a `secrets.*` reference in CI exactly.
- Tell the user how to run it (`bash <script>`; on Windows, from Git Bash). If it's a repeatable setup path, commit it and link it from the README.
