import { readFileSync, constants } from 'node:fs';
import { mkdir, lstat, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const defaultTelemetryDirectory = () => join(homedir(), '.ai-tuning', 'predictive-compaction');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const events = new Set(['session_started', 'session_ended', 'enabled_changed', 'phase_changed', 'agent_started', 'agent_ended', 'context_observed', 'schedule_decision', 'job_started', 'job_ready', 'job_failed', 'job_discarded', 'checkpoint_discarded', 'invalidated', 'provider_call_started', 'provider_call_finished', 'compaction_requested', 'checkpoint_hit', 'wait_started', 'wait_finished', 'blocking_started', 'compaction_prepared', 'compaction_cancelled', 'native_fallback', 'budget_rejected', 'compaction_committed', 'compaction_failed', 'events_dropped', 'consolidation_started']);
const numbers = new Set(['epoch', 'contextTokens', 'contextWindow', 'sourceTokens', 'sourceSize', 'reserveTokens', 'keepRecentTokens', 'triggerTokens', 'leadTokens', 'predictedLatencyMs', 'tokensPerSecond', 'tokensBefore', 'estimatedTokensAfter', 'projectionTokensAfter', 'durationMs', 'latencyMs', 'waitMs', 'readyAgeMs', 'call', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens', 'cost', 'jobsStarted', 'jobsCompleted', 'jobsFailed', 'jobsDiscarded', 'hits', 'waits', 'blocking', 'targetFraction', 'toleranceFraction', 'seedLatencyMs', 'seedTokensPerSecond', 'timeoutMs', 'idleGapMs', 'minLeadTokens', 'burstTokens', 'observationIntervalMs', 'protectedTokens', 'tailTokens', 'summaryTokens', 'overheadTokens', 'estimatedTokensBefore', 'projectionTokensBefore', 'systemPromptTokens', 'usageResidualTokens', 'headroomTokens', 'maxAfterTokens', 'requiredSavingsTokens', 'savedTokens', 'retentionFloorTokens', 'targetTokens', 'toleranceTokens']);
const booleans = new Set(['enabled', 'autoEnabled', 'active', 'canSnapshot', 'due', 'refresh', 'hasReady', 'hasJob', 'fromExtension', 'willRetry', 'usageKnown', 'customInstructions', 'accepted', 'aborted', 'aboveTarget', 'aboveTolerance']);
const identifiers = new Set(['jobId', 'entryId', 'cutId', 'snapshotHash', 'stepId']);
const enums = {
  phase: new Set(['off', 'watching', 'building', 'ready', 'handoff']),
  reason: new Set(['startup', 'command', 'off', 'session_shutdown', 'session_replaced', 'context_changed', 'session_compact', 'session_tree', 'model_select', 'session_compact_failed', 'threshold', 'overflow', 'refresh', 'replacement', 'manual', 'ready', 'blocking', 'late', 'aborted', 'timeout', 'preparation_failed', 'compaction_rejected', 'unsupported', 'configuration', 'quit', 'reload', 'unknown']),
  decision: new Set(['start', 'reuse', 'skip']),
  outcome: new Set(['success', 'failed', 'aborted', 'discarded', 'cancelled']),
  errorKind: new Set(['provider', 'aborted', 'timeout', 'validation', 'context', 'configuration', 'unknown']),
  budgetReason: new Set(['accepted', 'invalid', 'headroom', 'progress']),
  rejection: new Set(['provider', 'timeout', 'boundary', 'budget', 'checkpoint_missing', 'validation', 'aborted']),
};

function fields(data) {
  const result = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (numbers.has(key) && (value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0))) result[key] = value;
    else if (booleans.has(key) && typeof value === 'boolean') result[key] = value;
    else if (identifiers.has(key) && identifier(value)) result[key] = value;
    else if (enums[key]?.has(value)) result[key] = value;
  }
  return result;
}

async function checkDirectory(directory, allowMissing = false) {
  for (let current = resolve(directory);;) {
    let info;
    try { info = await lstat(current); }
    catch (error) { if (!allowMissing || error.code !== 'ENOENT') throw error; }
    if (info && (info.isSymbolicLink() || !info.isDirectory())) throw Object.assign(new Error('Unsafe log directory'), { code: 'LINK_REFUSED' });
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

async function safeDirectory(directory) {
  // Check existing ancestors before mkdir: recursive creation must not traverse a known link.
  await checkDirectory(directory, true);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await checkDirectory(directory);
}

async function appendBatch(path, data, fresh) {
  await safeDirectory(dirname(path));
  const flags = constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0) | (fresh ? constants.O_CREAT | constants.O_EXCL : 0);
  const before = fresh ? undefined : await lstat(path);
  if (before && (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1)) throw Object.assign(new Error('Unsafe log file'), { code: 'LINK_REFUSED' });
  const file = await open(path, flags, 0o600);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1 || (before && (info.ino !== before.ino || info.dev !== before.dev))) throw Object.assign(new Error('Unsafe log file'), { code: 'LINK_REFUSED' });
    await file.writeFile(data, 'utf8');
  } finally { await file.close(); }
}

/** Local, content-free diagnostics. A failed writer is disabled for this run only. */
export function createTelemetry({ sessionId, directory = defaultTelemetryDirectory(), runId = randomUUID(), wallNow = Date.now, monotonicNow = () => performance.now(), warn = () => {}, maxQueue = 512, maxFileBytes = 4 * 1024 * 1024, append = appendBatch } = {}) {
  let sequence = 0, written = 0, dropped = 0, pendingDrops = 0, segment = 0, bytes = 0, errorCode, running = false, inFlight = 0;
  const queue = [], start = monotonicNow();
  let elapsed = 0, task = Promise.resolve();
  const valid = identifier(sessionId) && identifier(runId) && Number.isInteger(maxQueue) && maxQueue > 0 && Number.isInteger(maxFileBytes) && maxFileBytes >= 4096;
  const sessionDirectory = valid ? join(resolve(directory), sessionId) : undefined;
  const filename = () => sessionDirectory ? join(sessionDirectory, `${runId}.${String(segment).padStart(4, '0')}.jsonl`) : undefined;
  const fail = error => {
    if (errorCode) return;
    errorCode = typeof error?.code === 'string' && /^[A-Z_0-9]{1,40}$/.test(error.code) ? error.code : 'LOG_WRITE_FAILED';
    dropped += queue.length + inFlight; queue.length = 0;
    try { warn(`Predictive compaction logging unavailable (${errorCode}); compaction remains enabled. Check /predictive-compaction status.`); }
    catch { errorCode = errorCode || 'NOTIFY_FAILED'; }
  };
  if (!valid) fail({ code: 'INVALID_LOG_OPTIONS' });

  function record(event, data = {}) {
    if (errorCode || !events.has(event)) return false;
    try {
      ++sequence;
      if (queue.length >= maxQueue) { ++dropped; ++pendingDrops; return false; }
      elapsed = Math.max(elapsed, monotonicNow() - start, 0);
      const entry = { schemaVersion: 1, extensionVersion: VERSION, sessionId, runId, seq: sequence, timestamp: new Date(wallNow()).toISOString(), elapsedMs: elapsed, event, ...fields(data), ...(pendingDrops ? { droppedBefore: pendingDrops } : {}) };
      pendingDrops = 0;
      const line = JSON.stringify(entry) + '\n';
      if (Buffer.byteLength(line) > 4096) { ++dropped; ++pendingDrops; return false; }
      queue.push(line); pump(); return true;
    } catch (error) { fail(error); return false; }
  }

  function pump() {
    if (running || errorCode) return;
    running = true;
    task = (async () => {
      while (queue.length && !errorCode) {
        if (bytes && bytes + Buffer.byteLength(queue[0]) > maxFileBytes) { ++segment; bytes = 0; }
        const batch = []; let size = 0;
        while (queue.length && bytes + size + Buffer.byteLength(queue[0]) <= maxFileBytes && batch.length < 64) {
          const line = queue.shift(); batch.push(line); size += Buffer.byteLength(line);
        }
        inFlight = batch.length;
        await append(filename(), batch.join(''), bytes === 0);
        bytes += size; written += batch.length; inFlight = 0;
      }
    })().catch(fail).finally(() => {
      running = false;
      if (pendingDrops && !errorCode) record('events_dropped');
      else if (queue.length && !errorCode) pump();
    });
  }

  return {
    record,
    status: () => ({ directory: sessionDirectory, file: filename(), runId, healthy: !errorCode, errorCode, written, queued: queue.length + inFlight, dropped, lastSequence: sequence }),
    async flush() { while (running) await task; },
  };
}

export function safeRecord(record, event, data) {
  try { record?.(event, data); }
  catch { return false; }
  return true;
}
