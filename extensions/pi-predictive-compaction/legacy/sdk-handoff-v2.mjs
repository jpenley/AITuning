/** Serialized into both Pi distributions. Keep this function self-contained. */
export function installPredictiveHandoff(session, estimateProjectedTokens) {
  let enabled = false, blocked = false, blockedModel, blockedSession, selectedModelKey, selectionPending = false, pending, gateModel;
  const pauseMessage = 'Processing paused at the 20% context-remaining limit. Compaction must succeed before work resumes; use /compact to recover or turn predictive compaction off.';
  session._setPredictiveCompactionEnabled = value => { enabled = value; session._predictiveHandoffEnabled = value; if (!value) blocked = false; };
  const usageFor = model => {
    const usage = session.getContextUsage();
    const contextWindow = model?.contextWindow ?? usage?.contextWindow;
    // Pi deliberately reports null until the first response after compaction.
    // Size the canonical projection instead of treating unknown usage as safe.
    const tokens = Number.isFinite(usage?.tokens) ? usage.tokens : estimateProjectedTokens(session.sessionManager.buildSessionProjection(), session.sessionManager.getBranch()).tokens;
    return { tokens, contextWindow, percent: contextWindow > 0 ? tokens / contextWindow * 100 : null };
  };
  session._getPredictiveCompactionUsage = () => enabled ? usageFor(gateModel ?? session._limitsModel()) : undefined;
  const limits = model => {
    const { tokens, contextWindow: window } = usageFor(model);
    const known = Number.isFinite(tokens) && Number.isFinite(window) && window > 0;
    return { due: known && tokens >= Math.ceil(window * 0.79), hard: known && tokens >= Math.ceil(window * 0.80) };
  };
  const latestCompaction = () => session.sessionManager.getBranch().findLast(e => e.type === 'compaction')?.id;

  const refreshSelection = () => {
    const selected = session.model ?? session._limitsModel();
    const key = JSON.stringify([selected?.provider, selected?.id, selected?.contextWindow]);
    if (selectedModelKey !== key) { blocked = false; selectionPending = selectedModelKey !== undefined; }
    selectedModelKey = key;
    return selected;
  };
  const preRoutingModel = () => {
    const selected = refreshSelection();
    // A new virtual selection has no physical response yet. Resolve its route
    // before reusing old routing history; check the actual physical model below.
    return selectionPending ? selected : session._limitsModel();
  };
  const pause = model => {
    blocked = true; blockedModel = model; blockedSession = session.sessionManager.getSessionId();
    throw new Error(pauseMessage);
  };
  const gate = async (model, signal) => {
    if (!enabled) return false;
    refreshSelection();
    signal?.throwIfAborted();
    if (session._agentRunAbortRequested) throw new Error('Processing cancelled');
    if (pending) {
      let onAbort, result;
      try {
        const aborted = signal ? new Promise((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); }) : undefined;
        result = await (aborted ? Promise.race([pending, aborted]) : pending);
      } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
      signal?.throwIfAborted();
      if (session._agentRunAbortRequested) throw new Error('Processing cancelled');
      if (enabled && limits(model).hard) pause(model);
      return result;
    }
    if (blockedSession !== session.sessionManager.getSessionId()) blocked = false;
    // A virtual route may have failed against a smaller window than the last
    // response's model. Only verified recovery against that window releases it.
    if (blocked && !limits(blockedModel).hard) blocked = false;
    if (blocked) throw new Error(pauseMessage);
    const state = limits(model);
    if (!state.due) return false;
    const before = latestCompaction();
    gateModel = model;
    pending = (async () => {
      // This return value is a continuation decision, NOT a success acknowledgement.
      const onAbort = () => session._autoCompactionAbortController?.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try { await session._runAutoCompaction('threshold', false); }
      finally { signal?.removeEventListener('abort', onAbort); }
      signal?.throwIfAborted();
      if (session._agentRunAbortRequested) throw new Error('Processing cancelled');
      const committed = latestCompaction() !== before;
      if (enabled && limits(model).hard) pause(model);
      return committed;
    })();
    try { return await pending; }
    finally { pending = undefined; gateModel = undefined; }
  };
  session._predictiveHandoff = gate;
  const prepareRun = session._prepareRun;
  session._prepareRun = async function (...args) {
    await gate(preRoutingModel());
    return prepareRun.apply(this, args);
  };
  const beforeTool = session._beforeToolCall;
  session._beforeToolCall = async function (...args) {
    refreshSelection();
    // Do not compact between a tool call and its results. Block new work, then
    // let synthetic blocked results and already-running tools close the batch.
    if (enabled && (blocked || limits(this._limitsModel()).hard)) return { block: true, reason: pauseMessage };
    const result = await beforeTool.apply(this, args);
    refreshSelection();
    if (enabled && (blocked || limits(this._limitsModel()).hard)) return { block: true, reason: pauseMessage };
    return result;
  };
  const finishTurn = session.agent.finishTurn;
  session.agent.finishTurn = async (...args) => {
    const decision = await finishTurn?.(...args);
    if (!args[1]?.aborted) await gate(session._limitsModel(), args[1]);
    return decision;
  };
  const compactBeforeResponse = session._compactBeforeNextAssistantResponse;
  session._compactBeforeNextAssistantResponse = async function (context) {
    if (!enabled) return compactBeforeResponse.call(this, context);
    await gate(preRoutingModel());
    return { ...context, messages: this.sessionManager.buildSessionProjection().messages };
  };
  const prepareRequest = session.agent.prepareRequest;
  session.agent.prepareRequest = async (request, signal) => {
    signal?.throwIfAborted();
    await gate(preRoutingModel(), signal);
    const prepared = await prepareRequest(request, signal);
    signal?.throwIfAborted();
    // Virtual models use the routed physical model's context window.
    if (await gate(prepared?.model, signal)) prepared.context = { ...prepared.context, messages: session.sessionManager.buildSessionProjection().messages };
    selectionPending = false;
    signal?.throwIfAborted();
    return prepared;
  };
  const postRun = session._handlePostAgentRun;
  session._handlePostAgentRun = async function (...args) {
    try { await gate(this._limitsModel()); }
    catch { return false; } // No retries or queued continuations after a failed hard stop.
    return postRun.apply(this, args);
  };
  const settle = session._runBeforeSettleBoundary;
  session._runBeforeSettleBoundary = async function (...args) {
    if (enabled && blocked) return false;
    return settle.apply(this, args);
  };
}
