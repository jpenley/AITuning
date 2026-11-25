# AITuning skills: no plugin install ({version})

{count} agent skills for Claude Code, packaged for clients that allow custom skills but not plugins. The installer copies the skills you choose into `~/.claude/skills`, where Claude Code finds them in every project, and installs the tools some of them use into `~/.claude/aituning`.

## Install

You need Claude Code, Node.js 24 or later, and a browser on the same machine.

1. Unzip this package anywhere.
2. Open a terminal in the unzipped folder and start `claude`.
3. Ask: **"Install the skills in this package by following README.md."**

Claude opens a page in your browser listing every skill with what it does and whether it is **automatic** (Claude uses it when a request matches) or **invoked** (it runs only when you type `/name`). A recommended core set starts ticked. Change the ticks, press **Submit**, and Claude installs your selection and reports what it did. Restart Claude Code afterwards so it loads the new skills.

To update, unzip a newer package and run the same request. Each skill folder that already exists is backed up to `~/.claude/skills-backup/<time>/` before it is replaced, so local edits can be recovered.

## What gets installed

| Where | What |
|---|---|
| `~/.claude/skills/<name>/` | Each chosen skill, plus any skill it depends on (it loads that skill or reads its files). |
| `~/.claude/aituning/evals/` | The eval toolkit the `tune` skill uses to check skills: structure validation, trigger routing, and wording comparisons. |
| `~/.claude/aituning/shared/` | Plain references several skills read, such as verification cadence and security-finding checks. Installed skills link here. |
| `~/.claude/aituning/readiness/` | An offline checker that reports which external tools (a browser, Mermaid CLI, .NET SDK) your skills still need. It launches nothing and reads no credentials. |
| `~/.claude/aituning/installed.json` | A record of each install: version, skills, added dependencies and backups. |

Nothing else on the machine changes: no settings, hooks, plugins, or credentials.

Some skills suggest other skills by name (for example "run `/spec` next"). When a suggested skill isn't in this package, the installer lists it in its report; the suggesting skill still works.

## Without a browser

Ask Claude to run `node install.mjs list`, choose skill names from it, then run `node install.mjs apply --skills name1,name2`. Add `--dry-run` first to see the plan.

## For Claude

Follow these steps from this folder. Each command prints one JSON object on stdout.

1. **Check Node**: `node --version` must be 24 or later. If it isn't, stop and tell the user.
2. **Write the selection page**: `node install.mjs page --out <scratch>/install.consult.json`, with `<scratch>` a temporary folder outside this package.
3. **Show it**: run `node skills/consult/scripts/consult.mjs serve <scratch>/install.consult.json` as a background command (in Claude Code, Bash with `run_in_background`). Tell the user a page opened in their browser, and give them the URL from the output if it didn't open. End your turn; you are woken when the user submits or closes the page.
4. **Read the result** from `<scratch>/install.consult.answer.json`.
   - `submitted`: continue.
   - `cancelled`, `closed` or `timeout`: ask the user in chat whether to reopen the page or stop. Install nothing.
5. **Install**: `node install.mjs apply --answers <scratch>/install.consult.answer.json`.
   - Exit 0 with `"status": "installed"`: report the installed skills, `addedDependencies`, `backups`, and any `softReferences` (skills mentioned but not installed). Then run the `readiness` command from the output and report anything missing.
   - Exit 1: report `problems`. Nothing was installed.
   - Exit 2: report `error`.
6. **Finish**: tell the user to restart Claude Code or start a new session, and that typing `/` lists the invoked skills.

## Contents

- `catalog.json`: every packaged skill with its group, description, mode, dependencies and requirements. The selection page is generated from it.
- `skills/`: the skill folders.
- `tools/`: the eval toolkit and the readiness checker.
- `install.mjs`: the installer (`node install.mjs --selftest` checks it in temporary folders).
- `LICENSE`, `THIRD_PARTY_NOTICES.md`, `LICENSES/`: the skills are MIT licensed; adapted sources keep their notices.
