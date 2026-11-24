---
name: rig
description: "Give a project a standing test rig in docs/agents/rig/: a recipe any agent follows to launch the real app, use it the way a user does, and capture proof, plus a feature map. `rig check` keeps an existing rig true to the app."
disable-model-invocation: true
---

# Rig

A **rig** is a project's standing recipe for proving behaviour in the running app: start the real app, use it the way a user does, and capture proof. It lives in `docs/agents/rig/`: `README.md` holds the recipe, and `features/` holds the feature map, one file per user-facing feature. Write both for the next agent, who reads them cold, mid-task, and has never seen the app.

## Choose the mode

- **`rig check`**, or `docs/agents/rig/` already exists: run **Check**.
- **`rig`** with no `docs/agents/rig/`: run **Create**.

## Create

### 1. Interview the repo

Answer these from the code; ask the user only what the code can't answer.

- **Surface**: what a user touches (a web UI, a CLI or TUI, a desktop app, an API, a library). With several, rig the primary one and name the rest.
- **Run**: how the app starts locally, from the repo's own scripts, Makefile, or README; its ports, environment variables, seed data, and auth.
- **Drive**: what can operate it programmatically. Existing harnesses first (end-to-end specs, expect scripts, PTY helpers, HTTP endpoints, a debug port); then a general capability: browser automation for web and web-based desktop apps, a PTY or terminal multiplexer (for example tmux) for a CLI or TUI, HTTP calls for a service.
- **Observe**: the evidence it can yield: screenshots, accessibility snapshots, terminal transcripts, response bodies, logs, exit codes, stored state.
- **Isolate**: whether a second instance can run beside the user's (its own port, data directory, profile). If it can't, the rig says so and drives only an instance it started.

If the checkout doesn't build or start, fix that or report exactly what fails before writing anything: a rig written against a broken checkout teaches wrong steps. A missing asset that blocks startup but doesn't matter to the rig (a sample config, a static folder nothing serves) may be created by Launch, marked as rig scaffolding, and removed by Cleanup.

For a console or desktop app with a semantic automation bridge, read [CONSOLE.md](CONSOLE.md) when choosing Drive and Evidence.

### 2. Write the recipe

Write `docs/agents/rig/README.md` with these sections, in order, each filled from what the interview found:

- **Launch**: the exact command that starts an instance; the ready signal (a log line, a port answering, a prompt); and how the run records what it started (a PID file, a session name). For a short-lived CLI or TUI, Launch builds or installs once, and each drive runs in its own isolated terminal session.
- **Doctor**: one read-only command that answers "is this instance worth driving?": the process is up, it is this run's instance (port, data directory), the build is the expected one, auth is valid. Agents run it before the first drive and after anything surprising.
- **Drive**: the harness and how to invoke it, with real selectors and commands from this repo.
- **Evidence**: what to capture, the directory it goes to, and these proof standards:
  - the real user path, not internal setters or test-only endpoints;
  - the action and the resulting state, not only the final screen;
  - side effects (rows, files, messages sent) confirmed from a second, read-only view;
  - mocks only where a production boundary already isolates the external system;
  - a dry-run or test mode verified by observing what it skips (files, network, git refs), not trusted by its name.
- **Cleanup**: stop exactly what Launch recorded and remove the run's scratch state. The evidence directory sits outside everything Cleanup removes.
- **Helpers**: every script the rig ships, runnable through its interpreter, with its invocation shown.

### 3. Seed the feature map

Write `docs/agents/rig/features/README.md` and one file for each of the top 3-5 user-facing features (from routes, commands, menus, or docs), in the format in [FEATURE-MAP.md](FEATURE-MAP.md).

### 4. Point the instruction file at it

Add this line to `AGENTS.md` (to the project's own instruction file instead when it has one but no `AGENTS.md`; create `AGENTS.md` when it has neither): "To prove behaviour in the running app, follow `docs/agents/rig/README.md` and its feature map."

### 5. Prove it once

Follow the rig end to end: launch, doctor, drive one mapped feature, capture evidence, clean up, then confirm the evidence still exists at its named location. Fix what fails, and run Cleanup after every failed attempt too, so no attempt strands a process or a port. A rig that was never executed is a draft: if you couldn't run it, report it as a draft and say what stopped you.

### 6. Report

The files written, the proof run (the feature driven and the evidence path), and anything the rig can't reach yet. Suggest the user run `rig check` after the app changes.

## Check

Keeps the rig true to the app. The unit of rigour is the feature: every feature file is covered from source and driven live.

**Outcome.** The pass ends in exactly one of these, stated:

- **clean**: every feature covered from source and live; nothing to change.
- **changed**: one change of corrections, each proven live in this pass.
- **blocked**: coverage couldn't finish, or a proven correction couldn't be made safely; say exactly what blocked it.

**Edit scope.** Only `docs/agents/rig/` and the helpers the rig owns; a check never edits product code.

1. **Locate.** Read `docs/agents/rig/README.md`. With no rig, stop and suggest the user run `rig`.
2. **Index hygiene.** Compare `features/README.md` with the files beside it: add missing entries, remove dead ones, merge duplicates.
3. **Source wave.** For each feature file, a read-only pass explains how the feature works now from source, flags likely drift with file and line citations, and returns one live recipe. Where the harness supports sub-agents, run one read-only sub-agent per feature file in parallel; otherwise do them one at a time yourself. These passes never drive the app or edit files.
4. **Reconcile.** Every feature file has a returned summary. Merge the recipes into as few app states as practical, spot-check the cited drift, and look through recent commits for user-facing surfaces missing from the map (a missing feature needs a source path).
5. **Live pass.** Required even when the source looks clean. You alone drive, following the rig's Launch; drive every feature at least once. Throughout:
   - run Doctor before the first drive and after any failed drive; where Doctor can't see the problem (a stuck UI on a healthy process), reset or relaunch;
   - the evidence captured so far survives every cleanup, checked at its location;
   - nothing a drive started outlives it, failed attempts included.

   A Doctor failure caused by drift in the rig is drift: fix it and retry once before calling the pass blocked. A feature that can't be reached is reported with the prerequisite it needs and the route tried.
6. **Triage** each finding:
   - **doc drift** (the app changed on purpose and the map describes it wrongly): fix the map;
   - **harness gap** (the app works, the rig can't drive it): fix the rig's helper, then drive it live again;
   - **product regression** (the app is broken): report it for the user, outside the change, and leave the map's expected behaviour as it is.
7. **Ship or stop.** For **changed**, re-read every changed file and ship the corrections as one change. For **clean** or **blocked**, change nothing. Run the final Cleanup after the last drive. Report the outcome, the features covered, each product regression with its evidence path, and each unreachable feature with its prerequisite.
