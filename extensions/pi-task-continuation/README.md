# Pi task continuation

A companion to `@juicesharp/rpiv-todo` that nudges Pi when the model stops with unfinished work. It records waiting conditions, asks for missing input, and reports external blockers to the `pi-herdr-prompts` companion. It does not change task statuses, restart tools, or grant permissions.

Checked with Pi **1.3.0**, rpiv-todo **2.13.9**, and Node **24**. The extension has no additional installed runtime dependencies; Pi supplies its SDK and terminal components.

## Install

Install rpiv-todo first if you do not already have it. Then add this local package to Pi:

```sh
pi install /path/to/AITuning/extensions/pi-task-continuation
```

Run `/reload` or restart Pi. Run `/task-guard` to check that the command is available. The default limits apply without configuration.

## Control the guard

| Command | Effect |
|---|---|
| `/task-guard` | Show unfinished-task counts, nudge counts, and waiting conditions. |
| `/task-guard status 4` | Show the complete waiting-condition record for task #4. |
| `/task-guard pause Waiting for a maintenance window` | Pause this guard's automatic nudges and persist the reason. It does not abort a running operation. |
| `/task-guard resume` | Re-arm the limits and request a model turn when tasks remain. Existing blockers require review rather than being silently resolved. Pi must be idle. |

Manual pauses survive reloads, compaction, and resumed sessions. They remain in effect until you use `resume`. These controls affect this guard, not continuations requested by other extensions.

## Record waiting conditions

The model gets a `task_blocker` tool. To pause a task, it must name the task, the waiting condition, and the next action:

```json
{
  "action": "set",
  "taskIds": [4],
  "kind": "user_input",
  "reason": "The database choice is missing",
  "nextAction": "User: choose PostgreSQL or SQLite"
}
```

The allowed kinds are `user_input`, `approval`, `access`, `external_dependency`, and `background_work`. Use `background_work` for activity already running, not as a reason to start polling or duplicate it. Reasons and next actions accept at most 1,000 characters each. Keep credentials out of both fields.

To remove a resolved condition, the model calls:

```json
{ "action": "clear", "taskIds": [4] }
```

When `task_blocker set` records a `user_input` condition, the guard opens a question if Pi has a UI. In the TUI, it prefers a callable `ask_user_question` extension. You can answer in its custom-answer row, choose **Answer now** for a native text dialog, or choose **Keep blocked**. If the extension is unavailable or cannot render, the guard uses Pi's native input popup. RPC uses the native popup directly. A permission denial or cancellation does not trigger a second dialog. Headless sessions keep the visible blocker report without opening a popup.

An answer returns through the blocker tool result and makes the affected conditions require review. It never clears a blocker, changes a task status, or grants approval. The model must explicitly clear or renew the condition. Repeated identical blocker calls do not reopen the question within the same request and loaded extension runtime. Reloading or navigating the session resets this prompt deduplication. Questions close on cancellation, shutdown, tree navigation, or removal or replacement of their blockers. Task completion also dismisses an obsolete question.

Keep credentials out of your answers. Pi retains answers in the tool-result transcript. The guard does not copy answers into blocker records or Herdr events.

A blocker pauses its tasks and their dependents, not independent work. When every remaining task is blocked, the guard displays the reason and required next action. It also keeps a persistent transcript entry. Long summaries show ten records; `status <task ID>` shows an individual record in full.

New user input makes earlier blockers require review. The model must clear a resolved condition or renew one that still applies. Unreviewed approval and background-work claims remain barriers: a status question is not deployment approval. Background results can trigger review without replenishing the nudge budget.

The guard emits `task-guard:blocked` with only `{ active }`. With the Herdr companion installed, any unresolved `user_input`, `approval`, `access`, or `external_dependency` condition makes Herdr show blocked, including conditions awaiting review. Independent work can still continue. Ordinary task dependencies and `background_work` conditions do not set this status because they can resolve automatically. Use `external_dependency` when another actor must act; use `background_work` for a job already running. Clearing the last external-action blocker releases the task wait. Restore, navigation, compaction, and task completion also reconcile the status.

The extension validates the record, not whether the model's explanation is true. An ordinary implementation problem or failing test remains work to investigate, not proof of an external blocker.

## Continuation and safety limits

At Pi's `agent_before_settle` boundary, the guard reads the active branch's persisted rpiv-todo snapshots. If actionable work remains, it appends a continuation message and requests one more model call. Dependency ordering determines which tasks are ready.

The guard permits **at most ten automatic nudges per user request**, with **at most three consecutive nudges without a newly completed task**. A new completion resets only the no-progress counter. Changing labels, clearing/recreating tasks, reloading, and low-level agent starts do not replenish the budget. A new user request or explicit `resume` re-arms it.

After a limit is reached, the guard displays a safety-limit reason and the resume command. It does not pretend that the limit is an external blocker. Waiting and stop reports are inert session entries, not hidden provider requests.

The guard does not nudge after cancellation, provider/runtime errors, or deferred provider operations. It respects open user dialogs and already queued continuations. It never changes a task status or marks work complete to satisfy itself. A malformed latest task snapshot produces a diagnostic rather than reviving an older list.

To lower the defaults, set these environment variables before starting Pi:

| Variable | Default | Accepted values |
|---|---|---|
| `PI_TASK_GUARD_MAX_NUDGES` | `10` | Integers `1` through `10` |
| `PI_TASK_GUARD_MAX_NO_PROGRESS` | `3` | Integers `1` through `3` |

Invalid values fail extension loading. Zero does not mean unlimited.

A hung tool or provider request is outside this guard's scope. The pre-stop boundary cannot run until the active operation returns. Task completion also remains a model claim, not independent proof that the implementation is correct.

## Run the checks

The tests exercise the registered tool, commands, and lifecycle handlers. Integration tests load this package's real entry point and the real rpiv-todo extension in the installed Pi SDK. Deterministic offline model responses exercise early stopping, explicit blockers, questionnaire answers and declines, native fallback, Herdr wait balancing, nested tool calls, and the no-progress cap. The tests prohibit network requests.

In PowerShell, point the tests at the installed packages, then run the package's test script:

```powershell
$env:PI_TASK_GUARD_SDK_ROOT = 'C:/path/to/node_modules/@earendil-works/pi-coding-agent'
$env:PI_TASK_GUARD_TODO_ROOT = "$HOME/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo"
$env:PI_TASK_GUARD_ASK_ROOT = "$HOME/.pi/agent/npm/node_modules/@juicesharp/rpiv-ask-user-question"
cd extensions/pi-task-continuation
npm test
```

Unset the two limit variables when testing the documented defaults. Test fixtures use temporary directories and fake runtime credentials. They do not load your credentials, workspace extensions, or project instructions.

Source: the companion reads rpiv-todo's persisted `rpiv-todo-state` contract, with legacy `todo` tool-result fallback. It imports no rpiv implementation modules. [Upstream rpiv-todo](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo).
