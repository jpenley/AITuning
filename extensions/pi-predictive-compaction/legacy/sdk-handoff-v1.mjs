/** Serialized into both Pi distributions. Keep this function self-contained. */
export function installPredictiveHandoff(session, estimateProjectedTokens) {
  let enabled = false, blocked = false, blockedModel, blockedSession, pending, gateModel;
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
  const gate = async (model, signal) => {
    if (!enabled) return false;
    signal?.throwIfAborted();
    if (session._agentRunAbortRequested) throw new Error('Processing cancelled');
    if (pending) return pending;
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
      await session._runAutoCompaction('threshold', false);
      const committed = latestCompaction() !== before;
      if (enabled && limits(model).hard) {
        blocked = true; blockedModel = model; blockedSession = session.sessionManager.getSessionId();
        throw new Error(pauseMessage);
      }
      return committed;
    })();
    try { return await pending; }
    finally { pending = undefined; gateModel = undefined; }
  };
  session._predictiveHandoff = gate;
  const prepareRun = session._prepareRun;
  session._prepareRun = async function (...args) {
    await gate(this._limitsModel());
    return prepareRun.apply(this, args);
  };
  const beforeTool = session._beforeToolCall;
  session._beforeToolCall = async function (...args) {
    // Do not compact between a tool call and its results. Block new work, then
    // let synthetic blocked results and already-running tools close the batch.
    if (enabled && (blocked || limits(this._limitsModel()).hard)) return { block: true, reason: pauseMessage };
    return beforeTool.apply(this, args);
  };
  const finishTurn = session.agent.finishTurn;
  session.agent.finishTurn = async (...args) => {
    const decision = await finishTurn?.(...args);
    if (!args[1]?.aborted) await gate(session._limitsModel());
    return decision;
  };
  const prepareRequest = session.agent.prepareRequest;
  session.agent.prepareRequest = async (request, signal) => {
    signal?.throwIfAborted();
    await gate(session._limitsModel(), signal);
    const prepared = await prepareRequest(request, signal);
    signal?.throwIfAborted();
    // Virtual models use the routed physical model's context window.
    if (await gate(prepared?.model, signal)) prepared.context = { ...prepared.context, messages: session.sessionManager.buildSessionProjection().messages };
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
