import { join } from 'node:path';
import { PredictiveCompaction } from './core.mjs';
import { captureView, summarizeSnapshot, finalizeSnapshot, PROVIDER, MODEL } from './host.mjs';
import { readPreferences, writePreferences } from './preferences.mjs';
import { createTelemetry, defaultTelemetryDirectory, safeRecord } from './telemetry.mjs';

export function registerPredictiveCompaction(pi, sdk, { preferencesPath = join(sdk.getAgentDir(), 'predictive-compaction.json'), telemetryDirectory = defaultTelemetryDirectory(), intervalMs = 1000, now, consolidateOnSettle = true } = {}) {
  let ctx, timer, telemetry, compactionRequest, started = false;
  let generation = 0, settlementTask, outcome, logicalStepId, stepBaseline, settled = false, consolidatedStepId;
  const userIds = () => new Set(ctx.sessionManager.getBranch().filter(e => e.type === 'message' && e.message.role === 'user').map(e => e.id));
  const clearSettlement = () => { ++generation; clearImmediate(settlementTask); settlementTask = undefined; };
  const engine = new PredictiveCompaction({
    now,
    summarize: (snapshot, options) => summarizeSnapshot(sdk, snapshot, options),
    finalize: (ready, view) => finalizeSnapshot(sdk, ready, view),
    notify: message => ctx?.ui.notify(message, 'warning'),
  });
  const supported = () => sdk.PREDICTIVE_COMPACTION_SDK_VERSION === 1 && typeof sdk.prepareCompaction === 'function' && typeof ctx?.getCompactionSettings === 'function' && typeof ctx?.createUsageRecorder === 'function' && typeof ctx?.setPredictiveCompactionEnabled === 'function';
  const display = () => {
    if (!ctx) return;
    const state = engine.status();
    // The native footer consumes this status inline; phases remain in the status command.
    ctx.ui.setStatus('predictive-compaction', state.enabled ? 'predict' : undefined);
  };
  const view = (consolidate = false) => {
    // agent_start precedes persistence of the new user message. Resolve the first new user ID later.
    if (!logicalStepId && stepBaseline) logicalStepId = ctx.sessionManager.getBranch().find(e => e.type === 'message' && e.message.role === 'user' && !stepBaseline.has(e.id))?.id;
    return captureView(sdk, ctx, ctx.getSystemPrompt(), telemetry?.record, { consolidate, stepId: logicalStepId });
  };
  const scheduleConsolidation = () => {
    if (!consolidateOnSettle || !started || !engine.enabled || engine.consuming || outcome !== 'completed') return;
    clearImmediate(settlementTask);
    const attachment = generation;
    settlementTask = setImmediate(() => {
      settlementTask = undefined;
      if (attachment !== generation || !started || !engine.enabled || engine.consuming || !ctx.isIdle() || ctx.hasPendingMessages?.()) return;
      if (engine.active) { void engine.active.promise.then(result => { if (result && attachment === generation) scheduleConsolidation(); }); return; }
      try {
        const current = view(true);
        if (!current?.canSnapshot || !current.consolidationEligible || current.stepId === consolidatedStepId) return;
        if (engine.retentionBudget(current)?.accepted === false) return;
        consolidatedStepId = current.stepId;
        engine.trace('consolidation_started', { stepId: current.stepId, sourceSize: current.sourceSize });
        const job = engine.start(current.snapshot());
        void job.promise.then(ready => {
          if (!ready || attachment !== generation) return;
          const latest = view();
          if (!ctx.isIdle() || ctx.hasPendingMessages?.() || !latest?.accepts(ready.snapshot)) engine.invalidate('context_changed');
          display();
        }).catch(error => { engine.lastError = error.message; engine.trace('compaction_failed', { errorKind: 'context', reason: 'context_changed' }); });
      } catch (error) { engine.lastError = error.message; engine.trace('compaction_failed', { errorKind: 'context', reason: 'context_changed' }); }
    });
    settlementTask.unref?.();
  };
  const contextStats = () => {
    try {
      const usage = ctx.getContextUsage(), settings = ctx.getCompactionSettings?.();
      return { contextTokens: usage?.tokens ?? null, contextWindow: usage?.contextWindow ?? null, autoEnabled: settings?.enabled, reserveTokens: settings?.reserveTokens, keepRecentTokens: settings?.keepRecentTokens };
    } catch { return { contextTokens: null, contextWindow: null }; }
  };
  const observe = () => {
    if (!started || !engine.enabled || !ctx || !supported()) return;
    if (ctx.isIdle()) { engine.previous = undefined; display(); return; }
    try { engine.observe(view(), { active: true }); }
    catch (error) { engine.lastError = error.message; engine.trace('compaction_failed', { errorKind: 'context', reason: 'context_changed' }); }
    display();
  };
  const activate = enabled => {
    if (!enabled) clearSettlement();
    if (enabled) {
      if (!supported()) throw new Error('Install the tested Pi 1.3.0 predictive-compaction SDK support, then restart Pi');
      const model = ctx.modelRegistry.find(PROVIDER, MODEL);
      if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) throw new Error('Configure OpenAI GPT-6 Luna in Pi before enabling predictive compaction');
    }
    engine.setEnabled(enabled);
    ctx?.setPredictiveCompactionEnabled?.(enabled);
    clearInterval(timer);
    if (enabled) { timer = setInterval(observe, intervalMs); timer.unref?.(); observe(); }
    display();
  };
  pi.registerCommand('predictive-compaction', {
    description: 'Prepare native Luna medium compaction ahead of time: on | off | status',
    handler: async (args, context) => {
      ctx = context;
      const command = args.trim() || 'status';
      if (command === 'on' || command === 'off') {
        try {
          const enabled = command === 'on';
          // Persist only after capability/auth checks succeed.
          activate(enabled);
          writePreferences(preferencesPath, enabled);
          pi.appendEntry('predictive-compaction-control', { enabled });
          ctx.ui.notify(`Predictive Compaction ${command}; Luna medium`, 'info');
        } catch (error) { activate(false); ctx.ui.notify(error.message, 'error'); }
      } else if (command === 'status') {
        ctx.ui.notify(JSON.stringify({ ...engine.status(), sdkSupported: supported(), preferencesPath, logging: telemetry?.status() }, null, 2), 'info');
      } else ctx.ui.notify('Usage: /predictive-compaction on|off|status', 'warning');
    },
  });
  pi.on('session_start', (_event, context) => {
    clearSettlement(); logicalStepId = undefined; consolidatedStepId = undefined; outcome = undefined; settled = false;
    ctx = context; started = true; stepBaseline = userIds();
    if (telemetry) { engine.setEnabled(false); telemetry.record('session_ended', { reason: 'session_replaced' }); void telemetry.flush(); }
    telemetry = createTelemetry({ sessionId: ctx.sessionManager.getSessionId(), directory: telemetryDirectory, warn: message => ctx.ui.notify(message, 'warning') });
    engine.record = telemetry.record; engine.lastPhase = undefined; compactionRequest = undefined;
    telemetry.record('session_started', { reason: 'startup', ...contextStats(), targetFraction: engine.options.target, toleranceFraction: engine.options.tolerance, seedLatencyMs: engine.options.seedLatencyMs, seedTokensPerSecond: engine.options.seedTokensPerSecond, timeoutMs: engine.options.timeoutMs, idleGapMs: engine.options.idleGapMs, minLeadTokens: engine.options.minLeadTokens, burstTokens: engine.options.burstTokens, observationIntervalMs: intervalMs });
    try { activate(readPreferences(preferencesPath).enabled); }
    catch (error) { activate(false); engine.trace('compaction_failed', { reason: 'configuration', errorKind: 'configuration' }); ctx.ui.notify(error.message, 'error'); }
  });
  pi.on('turn_end', (_event, context) => { ctx = context; observe(); });
  const beginStep = () => {
    clearSettlement();
    // Finished consolidation remains a valid prefix for a new step; unfinished idle work is cancelled.
    if (engine.active?.snapshot.consolidated) engine.active.controller.abort();
    logicalStepId = undefined; stepBaseline = userIds(); consolidatedStepId = undefined; outcome = undefined; settled = false;
  };
  pi.on('input', (_event, context) => { ctx = context; if (ctx.isIdle()) beginStep(); });
  pi.on('before_agent_start', (_event, context) => { ctx = context; if (settled) beginStep(); });
  // A continuation may fail before its next pre-settlement hook can publish an outcome.
  pi.on('agent_start', (_event, context) => { ctx = context; outcome = undefined; engine.trace('agent_started'); engine.previous = undefined; observe(); });
  pi.on('agent_end', (_event, context) => { ctx = context; engine.trace('agent_ended'); engine.previous = undefined; display(); });
  pi.on('agent_before_settle', (event, context) => { ctx = context; outcome = event.outcome; });
  pi.on('agent_settled', (event, context) => { ctx = context; settled = true; if (!event.aborted) scheduleConsolidation(); });
  pi.on('session_before_compact', async (event, context) => {
    ctx = context;
    compactionRequest = { started: engine.now(), record: telemetry?.record };
    safeRecord(compactionRequest.record, 'compaction_requested', { reason: event.reason, ...contextStats(), customInstructions: !!event.customInstructions, enabled: engine.enabled, willRetry: event.willRetry });
    if (!engine.enabled) return;
    const manual = event.reason === 'manual', attachment = generation, epoch = engine.epoch;
    const result = await engine.take(() => view(), { signal: event.signal, customInstructions: event.customInstructions, readyOnly: true });
    if (!engine.enabled || event.signal?.aborted || attachment !== generation || epoch !== engine.epoch) return { cancel: true };
    if (result?.failure) {
      const error = engine.lastError;
      engine.invalidate(manual ? 'manual' : 'threshold');
      engine.lastError = error; engine.lastFailure = result.failure;
      // Pi now owns this operation. Do not schedule another predictor while native work runs.
      engine.consuming = true;
      engine.trace('native_fallback', { reason: event.reason, rejection: result.failure });
      const cause = result.failure === 'checkpoint_missing' ? 'no acceptable predictive checkpoint is ready' : `predictive failure (${result.failure})`;
      ctx.ui.notify(`Using Pi native compaction: ${cause}. Native retention applies; historical directives may be summarized rather than kept verbatim.`, 'warning');
      display();
      return;
    }
    display();
    return result?.cancel ? { cancel: true } : result;
  });
  pi.on('session_compact', (event, context) => {
    ctx = context;
    const entry = event.compactionEntry, p = entry?.details?.predictive;
    let projectionTokensAfter = null;
    try { projectionTokensAfter = sdk.buildSessionProjection(ctx.sessionManager.getBranch()).messages.reduce((n, m) => n + sdk.estimateTokens(m), 0); }
    catch { projectionTokensAfter = null; }
    safeRecord(compactionRequest?.record ?? telemetry?.record, 'compaction_committed', { reason: event.reason, entryId: entry?.id, jobId: p?.jobId, tokensBefore: entry?.tokensBefore, estimatedTokensAfter: p?.estimatedTokensAfter ?? null, projectionTokensAfter, latencyMs: p?.latencyMs, durationMs: compactionRequest ? Math.max(0, engine.now() - compactionRequest.started) : null, fromExtension: event.fromExtension, willRetry: event.willRetry });
    compactionRequest = undefined; engine.invalidate('session_compact'); display();
  });
  for (const name of ['session_tree', 'model_select']) pi.on(name, (_event, context) => {
    ctx = context; clearSettlement(); consolidatedStepId = undefined;
    if (name === 'session_tree') { logicalStepId = undefined; stepBaseline = userIds(); }
    engine.invalidate(name); display();
  });
  pi.on('session_compact_failed', (event, context) => {
    ctx = context;
    safeRecord(compactionRequest?.record ?? telemetry?.record, 'compaction_failed', { reason: event.reason, outcome: event.aborted ? 'aborted' : 'failed', aborted: event.aborted, fromExtension: event.fromExtension, willRetry: event.willRetry, durationMs: compactionRequest ? Math.max(0, engine.now() - compactionRequest.started) : null });
    compactionRequest = undefined;
    const error = engine.lastError ?? event.errorMessage;
    engine.invalidate('session_compact_failed'); engine.lastError = error; display();
  });
  pi.on('session_shutdown', async () => {
    clearSettlement(); started = false; clearInterval(timer); engine.setEnabled(false); display();
    ctx?.setPredictiveCompactionEnabled?.(false);
    engine.trace('session_ended', { reason: 'session_shutdown' });
    if (telemetry) {
      let deadline;
      try { await Promise.race([telemetry.flush(), new Promise(resolve => { deadline = setTimeout(resolve, 500); deadline.unref?.(); })]); }
      finally { clearTimeout(deadline); }
    }
  });
  return engine;
}
