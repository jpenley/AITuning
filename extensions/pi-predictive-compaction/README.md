# Predictive compaction for Pi

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

Prepare a native Pi checkpoint with **OpenAI GPT-6 Luna, medium effort**, while your main agent continues working. When Pi requests compaction, the extension supplies the ready summary and retains the original recent context plus everything since the snapshot.

Loading starts off unless you have enabled the feature in your Pi preferences. The foreground model stays unchanged. This package requires the included SDK support for the unbundled and bundled Node distributions of Pi 1.3.0.

- [Controls](#controls)
- [Timing and retention](#timing-and-retention)
- [Large steps and consolidation](#large-steps-and-consolidation)
- [Saved diagnostics](#saved-diagnostics)
- [Qualify and install](#qualify-and-install)

## Controls

```text
/predictive-compaction on
/predictive-compaction off
/predictive-compaction status
```

On/off persists in `~/.pi/agent/predictive-compaction.json`, or the directory selected by `PI_CODING_AGENT_DIR`. It applies to new sessions and reloads. Other running Pi processes read it on their next reload. Status shows the model, effort, phase, predicted latency, context growth, lead tokens, job counts and last error. With automatic compaction enabled, the context indicator shows `(predict)` instead of `(auto)`, without adding a footer row. Turning predictive compaction off restores Pi's normal context indicator. With automatic compaction disabled, neither label appears. Use `/predictive-compaction status` to inspect phases and errors.

Off cancels this extension's background request and leaves Pi's ordinary compaction behavior in charge. Shutdown and reload also cancel preparation. No summarization runs during extension discovery.

## Timing and retention

Pi owns automatic compaction timing. It triggers when context usage exceeds `contextWindow - reserveTokens`, using Pi's effective model settings. Predictive mode adds no percentage handoff, processing hard stop or native-call quota. It does not force automatic compaction when Pi's automatic compaction is disabled.

At Pi's trigger, the extension supplies an acceptable ready checkpoint. If prediction is missing, unfinished, failed or unsafe, it cancels speculative work and immediately yields to native compaction. It does not wait for Luna or start another predictive job in the compaction hook. An aborted or invalidated request stays cancelled. Native failures follow Pi's ordinary recovery behavior without a predictive failure latch.

Background sizing uses provider usage when available and Pi's canonical estimate after compaction, when provider usage is unknown. Routed models use the physical model's window for observation. Pi retains its native routed-model threshold checks and closed-tool-batch ordering. Cancellation during routing cannot start fresh compaction or foreground inference.

Background preparation starts ahead of handoff, using Pi's effective settings, including model overrides:

```text
trigger = contextWindow - reserveTokens
lead = min(max(4096, floor(contextWindow / 2)), max(4096, p95_whole_job_latency * p95_active_context_growth + burst_allowance))
start when trigger - current_tokens <= lead
```

Cold starts use 120 seconds and 256 tokens/second. The latency seed stays until three completed jobs exist. Larger source histories scale latency estimates upward. Growth samples include tool results, use at least a one-second measurement interval, and exclude idle gaps over 30 seconds. Preparation lead is capped at half the context window, subject to the 4096-token minimum. A complete boundary is required; partial tool calls cannot enter a snapshot.

The checkpoint prefers 15% of the foreground window, with a soft 20% tolerance. Both goals rise to the estimated mandatory-retention floor when necessary. A larger checkpoint remains usable if it frees material context and leaves safe headroom. Handoff uses that checkpoint immediately, even while a replacement is building.

A replacement requires changed summarization input and enough newly compactable material to meet the minimum savings requirement below. A changed raw tail or missed soft goal alone cannot fund another preparation. Failed input is not retried unchanged. Protected text does not count as prospective reclaimable growth. Preparation times out after five minutes. Background scheduling stays suspended while native fallback runs. Ready checkpoints remove the summarization wait. Native projection and the next foreground request still take time.

For predictive checkpoints, the host appends **every discarded user text block and exact assistant `Ruling:` line** to a protected section. This policy retains approvals and early constraints without a model classifying them. Records carry forward across subsequent predictive compactions. Small current steps stay raw. Large steps can be split as described below. Pi's context edits remain authoritative.

The original snapshot cut ID is preserved. Returning a later cut would lose the intervening tail. Prefix, session, model, effective settings and system-prompt checks prevent stale reuse. Native read/modified-file metadata carries forward even when Pi marks the checkpoint as extension-owned.

Predictive checkpoints never remove protected instructions to meet a size goal. Acceptance requires both of these hard checks, even when native automatic compaction is off:

```text
minimum_savings = max(4096, ceil(estimated_tokens_before * 0.10))
headroom = max(4096, ceil(contextWindow * 0.05), burst_allowance)
maximum_after = floor(trigger - headroom)
```

The before and after estimates use the same message estimator and overhead. Overhead is the larger of the system-prompt estimate and the residual between reported usage and estimated messages. That residual is not verified fixed prompt cost. Protected text already contributes to summary tokens; it is not added twice. Diagnostics expose both estimates and the component counts.

Scheduling and settlement consolidation check the mandatory-retention floor before starting another job. A provably impossible floor does not spend a Luna call. Insufficient progress, unsafe headroom or invalid estimates reject the predictive checkpoint. Exceeding the soft 20%-of-window goal does not. Rejection never blocks Pi from attempting native compaction under its ordinary retention policy. An oversized instruction or indivisible tool group can still prevent safe compaction. Enabling midway through a session cannot recover wording already absent from its canonical context.

**Native recovery:** `/compact [instructions]`, automatic threshold compaction and overflow recovery all use ready-or-native handoff. Custom instructions must match a cached checkpoint to reuse it. Otherwise, the extension warns and yields without waiting for Luna. Native compaction uses your foreground model and Pi's normal retention policy. Historical directives and the current step may be summarized, not kept verbatim. An aborted request stays cancelled.

Luna uses Pi's existing provider authentication and native summary format. It has no tools. The extension adds no agent loop, journal rewrite, SemanticCompressor stage or external service. Every returned provider usage record, including rejected or unused work, enters native `predictive_compaction` usage entries. Checkpoints omit usage to avoid double counting. Provider failures before usage is returned have unknown usage; the failure appears in status.

## Large steps and consolidation

Large steps use Pi's split-span preparation with the effective `keepRecentTokens` allowance, normally 20,000 tokens. The host adjusts unsafe cuts so tool calls stay with their results. Completed older execution can enter the summary while recent execution stays raw. The current request and discarded steering remain exact in the protected section.

A later checkpoint combines the previous summary with newly compactable execution. It advances the cut only when its new summary covers that prefix. Logical step identity and file metadata carry through repeated splits. All messages after the frozen cut, including work appended during preparation, stay raw.

After a successfully completed `agent_settled` event, a committed rolling step with at least 4096 tokens of remaining summarization input can prepare one background consolidation. Aborted or failed runs and queued continuations do not qualify. Each low-level continuation needs a fresh successful pre-settlement outcome; an earlier success cannot authorize consolidation after a later failure. This job includes the final answer in its input and also keeps that answer raw. It does not delay settlement or commit directly to the session. A later compatible native compaction hook can consume the prepared result.

New input cancels unfinished consolidation. A finished consolidation remains reusable with an append-only new tail after validation. Off, shutdown, navigation and incompatible context changes cancel or invalidate prepared work.

## Saved diagnostics

Each session attachment writes a local JSONL stream:

```text
~/.ai-tuning/predictive-compaction/<session-id>/<run-id>.<segment>.jsonl
```

`/predictive-compaction status` shows the log directory, current file, run ID, health, written and queued counts, and dropped events. Logs start at `session_start`, even when prediction is off. A reload or restart creates a new run ID; it does not overwrite prior runs.

Every record carries `schemaVersion`, `extensionVersion`, `sessionId`, `runId`, `seq`, a UTC `timestamp`, monotonic `elapsedMs`, and `event`. Order records within a run by `seq`. Across runs, use timestamps and run IDs; sequence numbers restart. A process interruption can lose queued records or leave an incomplete final line.

Events cover session and agent lifecycle, on/off controls, phase changes, changed context observations, scheduling decisions, preparation jobs, provider usage, checkpoint reuse, waits, budget rejection, and manual native fallback. `compaction_prepared` means a packet was supplied, not committed. Only `compaction_committed` confirms a native session entry; `compaction_failed` distinguishes failures from aborts. Rejections carry an allowlisted category. Budget events report protected, summary, tail and overhead token estimates, comparable before/after estimates, required savings, headroom and the acceptance reason. `consolidation_started` identifies optional settlement work.

Provider events include reported input, output, cache and reasoning tokens, total tokens, cost, and duration. Unknown usage stays `null`, not zero. Late responses stay associated with their original session and job. Native Pi usage journals remain the billing authority; diagnostics do not add charges.

The writer allowlists measurements, identifiers, booleans, and enumerated reasons. It does not copy prompts, summaries, tool output, custom instruction text, or raw errors. There is no outbound telemetry or automatic tuning.

The asynchronous queue holds at most 512 waiting records, plus one batch of up to 64 records. Queue losses appear as sequence gaps and `droppedBefore`. Files rotate at 4 MiB without deleting earlier segments. An I/O failure disables logging for that run and warns once; compaction continues. Shutdown waits at most 500 ms for queued writes. Disk stalls and process exits can still lose records.

Keep the log directory private. Known linked directories and linked or hard-linked files are refused, but the checks do not prevent a local process from racing directory replacement. Retention is owner-managed: archive or delete old session directories when you no longer need them.

## Qualify and install

Use Node 24+ and an existing Pi 1.3.0 Node installation. On Windows, run these commands from an ordinary owner shell. Managed sandboxes may reject dependency junctions and temporary preference writes.

From this package directory, supply your installed Pi package path and a fresh evidence directory:

```powershell
node test/qualify.mjs <pi-package-root> <fresh-evidence-directory>
node install.mjs --pi-root <pi-package-root> --agent-dir <pi-agent-directory> --receipt <fresh-evidence-directory>/qualification.json --check
node install.mjs --pi-root <pi-package-root> --agent-dir <pi-agent-directory> --receipt <fresh-evidence-directory>/qualification.json
```

Qualification copies Pi into the evidence directory, links its installed dependencies, and tests the candidate patch there. It makes no paid model calls. The receipt binds passing tests to the source hashes. Installation rejects stale evidence and unexpected SDK bytes before patching. Original files stay in `.predictive-compaction-sdk-backup` inside the Pi package. Package registration uses native `pi install`.

The support patch routes this extension's status key into the context indicator and supplies observation capabilities. It preserves native compaction checks and adds a routing-cancellation check, not admission gates. Other extensions keep their normal status row. Upgrades recognize exact earlier patches, including both hard-stop generations, while preserving original backups. Unrelated Pi edits are still refused. Restart Pi after upgrading. `/reload` cannot replace the loaded renderer or SDK.

Installation leaves the feature off. Restart Pi to load the SDK changes, check `/predictive-compaction status`, then use `on` after installed acceptance succeeds. `/reload` alone cannot replace an already imported SDK. Pi upgrades require qualification of a matching support patch; unknown versions fail closed.

For an already registered local package, validate the new receipt with `install.mjs --check`, then run `node sdk-support.mjs apply <pi-package-root>`. This SDK-only upgrade preserves your on/off preference and package registration. Restart Pi after installed acceptance passes.

To remove the package, turn it off and run `pi remove <this-package-directory>`. To restore the SDK after stopping affected Pi processes, run `node sdk-support.mjs restore <pi-package-root>`. Restore refuses unrelated edits. The test suite checks an exact patch/restore round trip.

See the adaptive-budget amendment (private development evidence omitted), rolling compaction revision (private development evidence omitted), implementation contract (private development evidence omitted) and native multicorpus research (private development evidence omitted). Native hook behavior follows [Pi's compaction contract](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/compaction.md). This source export does not establish model quality or installed-host acceptance.
