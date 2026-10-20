import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { safeRecord } from './telemetry.mjs';
import { assessCompaction } from './budget.mjs';

export const DEFAULTS = Object.freeze({ target: 0.15, tolerance: 0.20, seedLatencyMs: 120000, seedTokensPerSecond: 256, timeoutMs: 300000, idleGapMs: 30000, minLeadTokens: 4096, burstTokens: 4096 });
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const percentile = values => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)];

/** One scheduler per Pi session. Provider calls and native session writes are injected. */
export class PredictiveCompaction {
  constructor({ summarize, finalize, now = () => performance.now(), notify = () => {}, record, options = {} }) {
    this.summarize = summarize;
    this.finalize = finalize;
    this.now = now;
    this.notify = notify;
    this.record = record;
    this.options = { ...DEFAULTS, ...options };
    this.enabled = false;
    this.epoch = 0;
    this.latencies = [];
    this.growth = [];
    this.bursts = [];
    this.metrics = { started: 0, completed: 0, failed: 0, discarded: 0, hits: 0, waits: 0, blocking: 0 };
  }

  trace(event, data = {}, record = this.record) {
    const state = this.status(), m = this.metrics;
    const fields = { phase: state.phase, epoch: this.epoch, jobsStarted: m.started, jobsCompleted: m.completed, jobsFailed: m.failed, jobsDiscarded: m.discarded, hits: m.hits, waits: m.waits, blocking: m.blocking, ...data };
    if (event) safeRecord(record, event, fields);
    if (record === this.record && state.phase !== this.lastPhase) {
      this.lastPhase = state.phase; safeRecord(record, 'phase_changed', fields);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.invalidate('off');
    this.trace('enabled_changed', { enabled });
  }

  invalidate(reason) {
    const cause = reason === 'session context changed' ? 'context_changed' : reason;
    if (this.ready) this.trace('checkpoint_discarded', { jobId: this.ready.jobId, reason: cause });
    ++this.epoch;
    if (this.ready) ++this.metrics.discarded;
    this.ready = undefined;
    this.active?.controller.abort(new Error(reason));
    this.previous = undefined;
    this.consuming = false;
    this.lastError = undefined;
    this.scope = undefined;
    this.lastStartedKey = undefined;
    this.lastFailure = undefined;
    this.failed = undefined;
    this.trace('invalidated', { reason: cause });
  }

  prediction() {
    const size = this.latestView?.sourceSize;
    const times = this.latencies.map(sample => size && sample.size ? sample.ms * Math.max(1, size / sample.size) : sample.ms);
    const latencyMs = times.length ? Math.max(percentile(times), times.length < 3 ? this.options.seedLatencyMs : 0) : this.options.seedLatencyMs;
    const tokensPerMs = this.growth.length ? percentile(this.growth) : this.options.seedTokensPerSecond / 1000;
    const burst = Math.max(this.options.burstTokens, this.bursts.length ? percentile(this.bursts) : 0);
    const lead = Math.ceil(Math.max(this.options.minLeadTokens, latencyMs * tokensPerMs + burst));
    const limit = this.latestView?.window ? Math.max(this.options.minLeadTokens, Math.floor(this.latestView.window * 0.5)) : lead;
    return { latencyMs, tokensPerSecond: tokensPerMs * 1000, leadTokens: Math.min(lead, limit) };
  }

  retentionBudget(view) {
    return view.retentionFloorTokens === undefined ? undefined : assessCompaction({ tokensAfter: view.retentionFloorTokens }, view, this.options);
  }

  canRefresh(ready, view, assessment = assessCompaction(this.finalize(ready, view), view, this.options)) {
    const inputKey = view.inputKey ?? view.key;
    return inputKey !== (ready.snapshot.inputKey ?? ready.snapshot.key) && inputKey !== this.lastStartedKey
      && this.retentionBudget(view)?.accepted !== false
      && (view.reclaimableSize ?? view.sourceSize) - (ready.snapshot.reclaimableSize ?? ready.snapshot.sourceSize) >= assessment.requiredSavingsTokens;
  }


  observe(view, { active = true } = {}) {
    if (!this.enabled || !view) return;
    if ((this.scope && this.scope !== view.scope) || (this.ready && !view.accepts(this.ready.snapshot)) || (this.active && !view.accepts(this.active.snapshot))) this.invalidate('session context changed');
    this.scope = view.scope;
    if (this.consuming) return;
    const now = this.now();
    const previous = this.previous;
    if (active && previous?.active && previous.scope === view.scope && Number.isFinite(view.tokens) && Number.isFinite(previous.tokens)) {
      const elapsed = now - previous.time, delta = view.tokens - previous.tokens;
      if (elapsed > 0 && elapsed <= this.options.idleGapMs && delta > 0) {
        this.growth = [...this.growth.slice(-31), delta / Math.max(1000, elapsed)];
        this.bursts = [...this.bursts.slice(-31), delta];
      }
    }
    this.previous = { active, scope: view.scope, time: now, tokens: view.tokens };
    this.latestView = view;
    const prediction = this.prediction(), trigger = view.window - view.settings.reserveTokens;
    const observation = { contextTokens: view.tokens ?? null, contextWindow: view.window, sourceSize: view.sourceSize, reserveTokens: view.settings.reserveTokens, keepRecentTokens: view.settings.keepRecentTokens, autoEnabled: view.settings.enabled, active, canSnapshot: view.canSnapshot, triggerTokens: trigger, leadTokens: prediction.leadTokens, predictedLatencyMs: prediction.latencyMs, tokensPerSecond: prediction.tokensPerSecond, hasReady: !!this.ready, hasJob: !!this.active };
    const observationKey = JSON.stringify(observation);
    if (observationKey !== this.lastObservation) { this.lastObservation = observationKey; this.trace('context_observed', observation); }
    if (!active || !Number.isFinite(view.tokens) || this.active || !view.canSnapshot) return;
    const due = trigger - view.tokens <= prediction.leadTokens;
    const readyBudget = this.ready && assessCompaction(this.finalize(this.ready, view), view, this.options);
    const refresh = this.ready && this.canRefresh(this.ready, view, readyBudget) && (!readyBudget.accepted || readyBudget.aboveTarget);
    const inputKey = view.inputKey ?? view.key;
    const sameReadyInput = this.ready && (this.ready.snapshot.inputKey ?? this.ready.snapshot.key) === inputKey;
    const feasible = this.retentionBudget(view)?.accepted !== false;
    const decision = ((!this.ready && due) || refresh) && feasible && this.lastStartedKey !== inputKey && !sameReadyInput ? 'start' : this.ready ? 'reuse' : 'skip';
    if (observationKey + decision !== this.lastDecision) {
      this.lastDecision = observationKey + decision;
      this.trace('schedule_decision', { decision, due, refresh: !!refresh, reason: refresh ? 'refresh' : 'threshold', ...observation });
    }
    if (feasible && ((!this.ready && due) || refresh)) {
      // Do not retry a failed or unrefreshable prefix on every timer tick.
      if (this.lastStartedKey === inputKey || sameReadyInput) return;
      this.start(view.snapshot(), undefined);
    }
  }

  start(snapshot, customInstructions) {
    if (this.active) return this.active;
    const controller = new AbortController(), epoch = this.epoch, started = this.now();
    const job = { id: randomUUID(), snapshot, controller, customInstructions, record: snapshot.recordTelemetry ?? this.record };
    const record = job.record;
    this.lastStartedKey = snapshot.inputKey ?? snapshot.key;
    ++this.metrics.started;
    this.active = job;
    this.trace('job_started', { jobId: job.id, cutId: snapshot.cutId, snapshotHash: snapshot.prefixHash, sourceTokens: snapshot.sourceTokens, sourceSize: snapshot.sourceSize, customInstructions: !!customInstructions }, record);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(this.options.timeoutMs)]);
    job.promise = (async () => {
      let onAbort;
      try {
        const cancelled = new Promise((_, reject) => {
          onAbort = () => reject(signal.reason);
          signal.addEventListener('abort', onAbort, { once: true });
          if (signal.aborted) onAbort();
        });
        const result = await Promise.race([this.summarize(snapshot, { signal, jobId: job.id, customInstructions, recordTelemetry: record }), cancelled]);
        if (signal.aborted || epoch !== this.epoch || !this.enabled) { ++this.metrics.discarded; this.trace('job_discarded', { jobId: job.id, reason: signal.aborted ? 'aborted' : 'context_changed', durationMs: Math.max(0, this.now() - started) }, record); return undefined; }
        if (!result?.summary?.trim()) throw new Error('Empty compaction summary');
        const latency = Math.max(1, this.now() - started);
        this.latencies = [...this.latencies.slice(-19), { ms: latency, size: snapshot.sourceSize }];
        const ready = { snapshot, result, jobId: job.id, latencyMs: latency, readyAt: this.now(), customInstructions };
        if (this.ready) { ++this.metrics.discarded; this.trace('checkpoint_discarded', { jobId: this.ready.jobId, reason: 'replacement' }, record); }
        this.ready = ready;
        ++this.metrics.completed;
        this.lastError = undefined;
        this.lastFailure = undefined;
        this.failed = undefined;
        this.trace('job_ready', { jobId: job.id, latencyMs: latency, sourceTokens: snapshot.sourceTokens, sourceSize: snapshot.sourceSize }, record);
        return ready;
      } catch (error) {
        if (epoch === this.epoch && this.enabled && !controller.signal.aborted && error?.name !== 'AbortError') {
          ++this.metrics.failed;
          const kind = signal.reason?.name === 'TimeoutError' || error?.name === 'TimeoutError' ? 'timeout' : 'provider';
          job.error = Object.assign(new Error(error?.message ?? 'Luna preparation failed'), { code: kind });
          this.lastError = job.error.message; this.lastFailure = kind;
          this.failed = { snapshot, customInstructions, error: job.error };
          this.notify('Luna preparation failed: ' + this.lastError);
          this.trace('job_failed', { jobId: job.id, reason: 'preparation_failed', errorKind: kind, durationMs: Math.max(0, this.now() - started) }, record);
        } else { ++this.metrics.discarded; this.trace('job_discarded', { jobId: job.id, reason: controller.signal.aborted || error?.name === 'AbortError' ? 'aborted' : 'context_changed', durationMs: Math.max(0, this.now() - started) }, record); }
        return undefined;
      } finally { signal.removeEventListener('abort', onAbort); if (this.active === job) this.active = undefined; this.trace(undefined, {}, record); }
    })();
    return job;
  }

  async take(getView, { signal, customInstructions, readyOnly = false } = {}) {
    if (!this.enabled) return undefined;
    if (this.consuming) return { cancel: true };
    this.consuming = true;
    const requested = this.now(), record = this.record, epoch = this.epoch;
    let source;
    const cancelled = () => signal?.aborted || !this.enabled || epoch !== this.epoch;
    const failure = (code, message) => Object.assign(new Error(message), { code });
    const cancel = () => {
      if (epoch === this.epoch) this.consuming = false;
      this.trace('compaction_cancelled', { reason: 'aborted', rejection: 'aborted', durationMs: Math.max(0, this.now() - requested), accepted: false }, record);
      return { cancel: true };
    };
    this.trace(undefined);
    try {
      if (cancelled()) return cancel();
      let view = getView();
      if (!view) throw failure('boundary', 'No model context available');
      const valid = ready => ready && ready.customInstructions === customInstructions && view.accepts(ready.snapshot);
      const canRefresh = ready => this.canRefresh(ready, view);
      let ready = valid(this.ready) ? this.ready : undefined;
      source = ready?.snapshot;
      if (!readyOnly && !this.active && (!ready || !assessCompaction(this.finalize(ready, view), view, this.options).accepted)
        && valid(this.failed) && (view.inputKey ?? view.key) === (this.failed.snapshot.inputKey ?? this.failed.snapshot.key)) {
        source = this.failed.snapshot; throw this.failed.error;
      }
      let joined = false;
      if (!readyOnly && ready && !assessCompaction(this.finalize(ready, view), view, this.options).accepted && (this.active || canRefresh(ready))) ready = undefined;
      // Native compaction hooks consume only a ready checkpoint, never speculative inference.
      if (!ready && readyOnly) {
        const floorBudget = this.retentionBudget(view);
        if (floorBudget && !floorBudget.accepted) {
          this.trace('budget_rejected', { contextTokens: view.tokens ?? null, contextWindow: view.window, rejection: 'budget', ...floorBudget }, record);
          throw failure('budget', `Mandatory retention needs approximately ${view.retentionFloorTokens} tokens; predictive ${floorBudget.budgetReason} requirement was not met; no required text was removed.`);
        }
        throw failure('checkpoint_missing', 'No usable ready checkpoint; use Pi native compaction');
      }
      if (!ready && this.active && this.active.customInstructions === customInstructions && view.accepts(this.active.snapshot)) {
        joined = true; ++this.metrics.waits;
        source = this.active.snapshot;
        ready = await this.wait(this.active, signal);
        if (cancelled() || !ready) return cancel();
        view = getView();
        if (!view?.accepts(ready.snapshot)) return cancel();
      }
      if (!ready) {
        if (this.active) { this.active.controller.abort(); await this.wait(this.active, signal, 'replacement'); }
        if (cancelled()) return cancel();
        view = getView();
        if (!view?.canSnapshot) throw failure('boundary', 'No closed prefix can be compacted with a safe recent tail');
        const floorBudget = this.retentionBudget(view);
        if (floorBudget && !floorBudget.accepted) {
          this.trace('budget_rejected', { contextTokens: view.tokens ?? null, contextWindow: view.window, rejection: 'budget', ...floorBudget }, record);
          throw failure('budget', `Mandatory retention needs approximately ${view.retentionFloorTokens} tokens; predictive ${floorBudget.budgetReason} requirement was not met; no required text was removed.`);
        }
        ++this.metrics.blocking;
        this.trace('blocking_started', { reason: 'blocking' }, record);
        source = view.snapshot();
        ready = await this.wait(this.start(source, customInstructions), signal, 'blocking');
        if (cancelled() || !ready) return cancel();
      } else if (!joined) { ++this.metrics.hits; this.trace('checkpoint_hit', { jobId: ready.jobId, readyAgeMs: Math.max(0, this.now() - ready.readyAt) }, record); }
      if (cancelled()) return cancel();
      view = getView();
      if (!view?.accepts(ready.snapshot)) return cancel();
      let packet = this.finalize(ready, view);
      if (!readyOnly && !assessCompaction(packet, view, this.options).accepted && !this.active && canRefresh(ready) && view.canSnapshot) {
        ++this.metrics.blocking;
        this.trace('blocking_started', { reason: 'blocking' }, record);
        source = view.snapshot();
        ready = await this.wait(this.start(source, customInstructions), signal, 'blocking');
        if (cancelled() || !ready) return cancel();
        view = getView();
        if (!view?.accepts(ready.snapshot)) return cancel();
        packet = this.finalize(ready, view);
      }
      const assessment = assessCompaction(packet, view, this.options);
      if (!assessment.accepted) {
        this.trace('budget_rejected', { jobId: ready.jobId, contextTokens: view.tokens ?? null, contextWindow: view.window, protectedTokens: packet.protectedTokens, tailTokens: packet.tailTokens, summaryTokens: packet.summaryTokens, overheadTokens: packet.overheadTokens, rejection: 'budget', ...assessment }, record);
        throw failure('budget', `Checkpoint needs approximately ${packet.tokensAfter} tokens; predictive ${assessment.budgetReason} requirement was not met (safe maximum ${assessment.maxAfterTokens ?? 'unavailable'}, required savings ${assessment.requiredSavingsTokens ?? 'unavailable'}); no required text was removed.`);
      }
      this.ready = undefined; // Claimed exactly once; native session_compact acknowledges it.
      this.trace('compaction_prepared', { jobId: ready.jobId, tokensBefore: view.tokens ?? null, protectedTokens: packet.protectedTokens, tailTokens: packet.tailTokens, summaryTokens: packet.summaryTokens, overheadTokens: packet.overheadTokens, systemPromptTokens: view.systemPromptTokens, usageResidualTokens: view.usageResidualTokens, projectionTokensBefore: view.projectionTokensBefore, durationMs: Math.max(0, this.now() - requested), ...assessment }, record);
      return { compaction: packet.compaction };
    } catch (error) {
      if (cancelled() || error?.name === 'AbortError') return cancel();
      if (source) {
        try { if (!getView()?.accepts(source)) return cancel(); }
        catch { return cancel(); } // An unreadable live context cannot authorize inference.
      }
      const kind = ['provider', 'timeout', 'boundary', 'budget', 'checkpoint_missing'].includes(error?.code) ? error.code : 'validation';
      this.lastError = error.message; this.lastFailure = kind;
      this.notify('Predictive compaction failed: ' + error.message);
      this.consuming = false;
      this.trace('compaction_cancelled', { reason: 'compaction_rejected', rejection: kind, durationMs: Math.max(0, this.now() - requested), accepted: false }, record);
      return { cancel: true, failure: kind };
    }
  }

  async wait(job, signal, reason = 'late') {
    const start = this.now(), record = job.record ?? this.record;
    this.trace('wait_started', { jobId: job.id, reason }, record);
    let onAbort;
    try {
      if (signal?.aborted) throw new Error('Compaction aborted');
      const aborted = signal ? new Promise((_, reject) => { onAbort = () => { job.controller.abort(); reject(new Error('Compaction aborted')); }; signal.addEventListener('abort', onAbort, { once: true }); }) : undefined;
      const result = await (aborted ? Promise.race([job.promise, aborted]) : job.promise);
      if (job.error) throw job.error;
      this.trace('wait_finished', { jobId: job.id, reason, waitMs: Math.max(0, this.now() - start), outcome: result ? 'success' : 'failed' }, record);
      return result;
    } catch (error) {
      this.trace('wait_finished', { jobId: job.id, reason, waitMs: Math.max(0, this.now() - start), outcome: signal?.aborted ? 'aborted' : 'failed' }, record);
      throw error;
    } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
  }

  status() {
    return { enabled: this.enabled, phase: !this.enabled ? 'off' : this.consuming ? 'handoff' : this.active ? 'building' : this.ready ? 'ready' : 'watching', model: 'openai/gpt-6-luna', effort: 'medium', ...this.prediction(), readyJob: this.ready?.jobId, lastError: this.lastError, lastFailure: this.lastFailure, metrics: { ...this.metrics } };
  }
}
