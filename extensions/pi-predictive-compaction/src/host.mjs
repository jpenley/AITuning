import { hash } from './core.mjs';
import { performance } from 'node:perf_hooks';
import { safeRecord } from './telemetry.mjs';

export const MODEL = 'gpt-6-luna';
export const PROVIDER = 'openai';
const HEADER = '\n\n## Verbatim retained directives\n\nThese are historical user messages and assistant rulings, in source order. Later corrections and approval scope still apply.\n';
const textBlocks = message => typeof message.content === 'string' ? [message.content] : (message.content ?? []).filter(b => b.type === 'text').map(b => b.text);
const visible = projection => projection.entries.filter(e => e.messages.length).map(e => ({ id: e.sourceEntry.id, messages: e.messages }));

function closed(messages) {
  const pending = new Set();
  for (const message of messages) {
    for (const block of Array.isArray(message.content) ? message.content : []) if (block.type === 'toolCall') pending.add(block.id);
    if (message.role === 'toolResult') pending.delete(message.toolCallId);
  }
  return pending.size === 0;
}

function retainedRecords(projected, cut) {
  const records = new Map();
  const previous = projected.find(e => e.sourceEntry.type === 'compaction')?.sourceEntry;
  const inherited = previous?.details?.predictive?.verbatim ?? [];
  if (!Array.isArray(inherited) || inherited.some(r => typeof r.key !== 'string' || typeof r.text !== 'string' || !['user', 'ruling'].includes(r.kind))) throw new Error('Invalid retained-directive metadata');
  for (const record of inherited) records.set(record.key, record);
  for (const entry of projected.slice(0, cut)) {
    if (entry.sourceEntry.type === 'compaction') continue;
    for (const [mi, message] of entry.messages.entries()) for (const [bi, text] of textBlocks(message).entries()) {
      if (message.role === 'user') {
        const key = `${entry.sourceEntry.id}:${mi}:${bi}:user`;
        records.set(key, { key, kind: 'user', text });
      } else if (message.role === 'assistant') {
        const lines = text.match(/^[^\r\n]*\bRuling:[^\r\n]*(?:\r\n|\r|\n|$)/gm) ?? [];
        lines.forEach((line, index) => {
          const key = `${entry.sourceEntry.id}:${mi}:${bi}:ruling:${index}`;
          records.set(key, { key, kind: 'ruling', text: line });
        });
      }
    }
  }
  return [...records.values()];
}

export function renderVerbatim(records) {
  return records.length ? HEADER + records.map(r => `\n[${r.kind} ${r.key}; ${r.text.length} UTF-16 units]\n${r.text}\n`).join('') : '';
}

/** Canonical Pi projection is the authority, including context edits and prior compaction. */
export function captureView(sdk, ctx, systemPrompt, recordTelemetry, { consolidate = false, stepId: logicalStepId } = {}) {
  const usage = ctx.getContextUsage();
  if (!ctx.model || !usage?.contextWindow) return undefined;
  const settings = ctx.getCompactionSettings();
  const entries = structuredClone(ctx.sessionManager.getBranch());
  const projection = sdk.buildSessionProjection(entries);
  const projected = projection.entries;
  const canonical = visible(projection);
  const scope = hash({ session: ctx.sessionManager.getSessionId(), file: ctx.sessionManager.getSessionFile(), model: ctx.model, settings, systemPrompt });
  const key = hash({ scope, canonical });
  const window = usage.contextWindow;
  const messages = projection.messages;
  const estimated = messages.reduce((n, m) => n + sdk.estimateTokens(m), 0);
  // Account for foreground prompt/tool overhead without using it as summarization input.
  const systemPromptTokens = sdk.estimateTokens({ role: 'user', content: systemPrompt ?? '', timestamp: 0 });
  const usageResidualTokens = Number.isFinite(usage.tokens) ? Math.max(0, usage.tokens - estimated) : 0;
  const overhead = Math.max(systemPromptTokens, usageResidualTokens);
  const estimatedTokensBefore = Math.ceil(overhead + estimated);
  const previous = projected.find(e => e.sourceEntry.type === 'compaction')?.sourceEntry;
  const prior = previous?.details?.predictive;
  const currentStep = projected.findLastIndex(e => e.sourceEntry.type !== 'compaction' && e.messages.some(m => m.role === 'user'));
  const stepId = logicalStepId ?? (currentStep >= 0 ? projected[currentStep].sourceEntry.id : prior?.stepId);
  const stepTokens = projected.slice(Math.max(0, currentStep)).flatMap(e => e.messages).reduce((n, m) => n + sdk.estimateTokens(m), 0);
  // Small steps stay raw. Large steps use Pi's native split-span preparation.
  let keepRecentTokens = consolidate ? 0 : currentStep >= 0 && stepTokens <= settings.keepRecentTokens
    ? Math.max(settings.keepRecentTokens, stepTokens + 1) : settings.keepRecentTokens;
  const calls = new Map(), edges = [];
  for (const [index, entry] of projected.entries()) for (const message of entry.messages) {
    for (const block of Array.isArray(message.content) ? message.content : []) if (block.type === 'toolCall') calls.set(block.id, index);
    if (message.role === 'toolResult' && calls.has(message.toolCallId)) edges.push([calls.get(message.toolCallId), index]);
  }
  let preparation, cut;
  for (;;) {
    preparation = sdk.prepareCompaction(entries, { ...settings, keepRecentTokens });
    cut = preparation ? projected.findIndex(e => e.sourceEntry.id === preparation.firstKeptEntryId) : -1;
    const crossing = edges.filter(([call, result]) => call < cut && result >= cut);
    if (!crossing.length) break;
    const safeCut = Math.min(...crossing.map(([call]) => call));
    const required = projected.slice(safeCut).flatMap(e => e.messages).reduce((n, m) => n + sdk.estimateTokens(m), 0) + 1;
    if (required <= keepRecentTokens) { cut = -1; break; }
    keepRecentTokens = required;
  }
  const canSnapshot = cut > 0 && !!preparation && closed(messages);
  const rolling = (prior?.stepId === stepId && !!prior?.rolling) || (currentStep >= 0 && cut > currentStep);
  // Consolidation includes the final answer as context, while also retaining it raw.
  if (consolidate && canSnapshot) {
    const completion = projected.slice(cut).flatMap(e => e.messages);
    if (preparation.isSplitTurn) preparation.turnPrefixMessages.push(...completion);
    else preparation.messagesToSummarize.push(...completion);
  }
  const verbatim = canSnapshot ? retainedRecords(projected, cut) : [];
  const protectedFloor = sdk.estimateTokens({ role: 'user', content: renderVerbatim(verbatim), timestamp: 0 });
  const freshTail = cut >= 0 ? projected.slice(cut).flatMap(e => e.messages).reduce((n, m) => n + sdk.estimateTokens(m), 0) : estimated;
  const retentionFloorTokens = Math.ceil(overhead + 128 + protectedFloor + freshTail);
  const suffix = renderVerbatim(prior?.verbatim ?? []);
  if (suffix && preparation?.previousSummary?.endsWith(suffix)) preparation.previousSummary = preparation.previousSummary.slice(0, -suffix.length);
  const reclaimableTokens = preparation ? [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages].reduce((n, m) => n + sdk.estimateTokens(m), 0) : 0;
  const sourceSize = reclaimableTokens + Math.ceil((preparation?.previousSummary?.length ?? 0) / 4);
  const inheritedKeys = new Set((prior?.verbatim ?? []).map(record => record.key));
  const protectedInput = sdk.estimateTokens({ role: 'user', content: renderVerbatim(verbatim.filter(record => !inheritedKeys.has(record.key))), timestamp: 0 });
  const duplicatedTail = consolidate ? freshTail : 0;
  const reclaimableInputTokens = Math.max(0, reclaimableTokens - protectedInput - duplicatedTail);
  const reclaimableSize = reclaimableInputTokens + Math.ceil((preparation?.previousSummary?.length ?? 0) / 4);
  const inputKey = hash({ scope, cutId: preparation?.firstKeptEntryId, messages: preparation?.messagesToSummarize, prefix: preparation?.turnPrefixMessages, previousSummary: preparation?.previousSummary, verbatim, consolidate });
  return {
    scope, key, inputKey, window, tokens: usage.tokens, estimatedTokensBefore, projectionTokensBefore: estimated, systemPromptTokens, usageResidualTokens, retentionFloorTokens, settings, overhead, canonical, projected, canSnapshot, sourceSize, reclaimableSize, stepId, rolling, consolidate,
    consolidationEligible: !!prior?.rolling && prior.stepId === stepId && !prior.consolidated && reclaimableInputTokens >= 4096,
    accepts(snapshot) {
      return snapshot.scope === scope && snapshot.canonical.length <= canonical.length && hash(canonical.slice(0, snapshot.canonical.length)) === snapshot.prefixHash;
    },
    snapshot() {
      if (!canSnapshot) throw Object.assign(new Error('No closed prefix can be compacted with a safe recent tail'), { code: 'boundary' });
      const previous = projected.find(e => e.sourceEntry.type === 'compaction')?.sourceEntry;
      const previousDetails = previous?.details;
      // Hook-owned native metadata is otherwise ignored by Pi's file-op extractor.
      for (const path of previousDetails?.readFiles ?? []) preparation.fileOps.read.add(path);
      for (const path of previousDetails?.modifiedFiles ?? []) preparation.fileOps.written.add(path);
      return { scope, key, inputKey, stepId, rolling, consolidated: consolidate, canonical, prefixHash: hash(canonical), cutId: preparation.firstKeptEntryId, preparation, verbatim, recordUsage: ctx.createUsageRecorder(), recordTelemetry, registry: ctx.modelRegistry, sourceTokens: usage.tokens, sourceSize, reclaimableSize };
    },
  };
}

export async function summarizeSnapshot(sdk, snapshot, { signal, jobId, customInstructions, recordTelemetry = snapshot.recordTelemetry }) {
  const model = snapshot.registry.find(PROVIDER, MODEL);
  if (!model) throw new Error('OpenAI GPT-6 Luna is unavailable; select/configure it in Pi before enabling predictive compaction');
  let calls = 0;
  const result = await sdk.compact(snapshot.preparation, model, undefined, undefined, customInstructions, signal, 'medium', (m, context, options) => ({
    result: async () => {
      const number = ++calls, started = performance.now();
      let usage, outcome = 'failed';
      safeRecord(recordTelemetry, 'provider_call_started', { jobId, call: number });
      try {
        const response = await snapshot.registry.streamSimple(m, context, options).result();
        usage = response.usage;
        if (!usage) throw new Error('Luna response omitted usage accounting');
        snapshot.recordUsage('predictive_compaction', m.provider, m.id, usage, `${jobId} call ${number}; includes unsuccessful/discarded preparation`);
        if (response.stopReason !== 'stop') throw new Error(`Luna summary stopped with ${response.stopReason}; partial output rejected`);
        if (!response.content.filter(b => b.type === 'text').some(b => b.text.trim())) throw new Error('Luna returned empty summary text');
        if (signal.aborted) throw new Error('Luna compaction aborted');
        outcome = 'success';
        return response;
      } finally {
        safeRecord(recordTelemetry, 'provider_call_finished', { jobId, call: number, durationMs: Math.max(0, performance.now() - started), outcome: signal.aborted ? 'aborted' : outcome, usageKnown: !!usage,
          inputTokens: usage?.input ?? null, outputTokens: usage?.output ?? null, cacheReadTokens: usage?.cacheRead ?? null, cacheWriteTokens: usage?.cacheWrite ?? null, reasoningTokens: usage?.reasoning ?? null, totalTokens: usage?.totalTokens ?? null, cost: usage?.cost?.total ?? null });
      }
    },
  }), undefined, { enabled: false, maxRetries: 0 }, undefined, `predictive-${jobId}`);
  if (!result.summary.trim()) throw new Error('Luna returned an empty native summary');
  // Each provider attempt was recorded above. Native commit must not count it again.
  const { usage: _usage, ...packet } = result;
  return packet;
}

export function finalizeSnapshot(sdk, ready, view) {
  const { snapshot, result, jobId, latencyMs } = ready;
  if (!view.accepts(snapshot)) throw new Error('Snapshot prefix no longer matches');
  const cut = view.projected.findIndex(e => e.sourceEntry.id === snapshot.cutId);
  if (cut < 0) throw new Error('Snapshot cut point is absent');
  const summary = result.summary + renderVerbatim(snapshot.verbatim);
  const tail = view.projected.slice(cut).flatMap(e => e.messages);
  const protectedTokens = sdk.estimateTokens({ role: 'user', content: renderVerbatim(snapshot.verbatim), timestamp: 0 });
  const tailTokens = tail.reduce((n, m) => n + sdk.estimateTokens(m), 0);
  const summaryTokens = sdk.estimateTokens({ role: 'user', content: summary, timestamp: 0 });
  const tokensAfter = Math.ceil(view.overhead + 128 + summaryTokens + tailTokens);
  return { tokensAfter, protectedTokens, tailTokens, summaryTokens, overheadTokens: view.overhead, compaction: { summary, firstKeptEntryId: snapshot.cutId, tokensBefore: view.tokens ?? snapshot.preparation.tokensBefore, estimatedTokensAfter: tokensAfter,
    details: { ...result.details, predictive: { version: 2, stepId: snapshot.stepId, rolling: snapshot.rolling, consolidated: snapshot.consolidated, jobId, snapshotHash: snapshot.prefixHash, latencyMs, sourceTokens: snapshot.sourceTokens, sourceSize: snapshot.sourceSize, estimatedTokensAfter: tokensAfter, verbatim: snapshot.verbatim, model: `${PROVIDER}/${MODEL}`, effort: 'medium', usageRecordedSeparately: true } } } };
}
