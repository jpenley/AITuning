# Pi herdr prompt status

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

Show herdr's blocked status while Pi waits for human input or external action on a task. Herdr's existing integration still owns working, idle, and socket reporting.

The companion forwards these waits to `herdr:blocked`:

- External-action blockers from [Pi task continuation](../pi-task-continuation/README.md), through `task-guard:blocked`. This includes user input, approvals, missing access, and external dependencies, even while independent tasks continue. Ordinary task dependencies and automatically resolving background work are excluded.
- Questionnaires from `@juicesharp/rpiv-ask-user-question`, through `rpiv:ask-user:blocked`.
- Extension selection, confirmation, text-input, and editor dialogs, through Pi's `ui_prompt_start` and `ui_prompt_end` events. This includes approvals and MCP elicitation that use those APIs.

Answers, cancellation, and errors close dialog waits. Task waits stay active until the last external-action blocker is removed or the session shuts down. Closing a question does not clear its task blocker. Overlapping task waits, native dialogs, and questionnaires keep separate, balanced contributions. Only fixed labels reach herdr; task details, dialog titles, question text, and answers are not forwarded.

The task wait is restored after session initialization, regardless of extension load order. The bridge requests the guard's current status through `task-guard:status-request` and deduplicates task-status transitions before updating Herdr's wait counter.

## Coverage limits

Generic `custom` components are excluded because viewers and progress displays use the same API. The explicit questionnaire event still covers its custom UI. Plain chat questions and dialogs outside Pi's extension UI APIs have no supported wait signal here.

Pi groups overlapping UI calls into one event pair, identified by the first dialog. A native dialog opened under a custom viewer can therefore go undetected. A custom component overlapping a native dialog can keep that reported wait open longer. The bridge does not patch Pi or guess from dialog titles.

## Install beside herdr's integration

Enable herdr's Pi integration first. Keep its managed `herdr-agent-state.ts` file unchanged.

From the AITuning repository root, copy this companion into Pi's personal extensions directory:

```powershell
Copy-Item -LiteralPath ./extensions/pi-herdr-prompts/index.ts -Destination "$HOME/.pi/agent/extensions/herdr-user-prompts.ts"
```

Run `/reload` or restart Pi. Install the companion only once; loading both the copy and this package doubles the events. To update the copy, repeat the command. To remove it, delete `herdr-user-prompts.ts` and reload Pi.

Herdr chooses the status glyph. Its `status_indicators = "symbols"` setting selects distinct symbols rather than colored dots.

## Run the checks

Use Node 24 or later and Pi 1.3.0 with the paired UI prompt events. Point the tests at your installed packages, then run:

```powershell
$env:PI_HERDR_INTEGRATION_PATH = "$HOME/.pi/agent/extensions/herdr-agent-state.ts"
$env:PI_HERDR_SDK_ROOT = "C:/path/to/node_modules/@earendil-works/pi-coding-agent"
cd extensions/pi-herdr-prompts
npm test
```

The tests exercise the public event boundary, real Pi UI event dispatch, and the installed herdr integration against a temporary local socket. They cover all four native dialog kinds, cancellation, errors, overlap, shutdown cleanup, privacy, persisted task waits, initialization replay, and exclusion of generic custom viewers. The SDK fixtures use isolated model storage and forbid network requests. The tests do not contact your running herdr instance or verify its visual rendering.
