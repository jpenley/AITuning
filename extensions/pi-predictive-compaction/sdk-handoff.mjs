/** Serialized into both Pi distributions. Observation only: native Pi owns compaction timing. */
export function installPredictiveHandoff(session, estimateProjectedTokens) {
  let enabled = false, compactionModel;
  session._setPredictiveCompactionEnabled = value => { enabled = value; };
  session._withPredictiveCompactionModel = async (model, action) => {
    const previous = compactionModel; compactionModel = model;
    try { return await action(); } finally { compactionModel = previous; }
  };
  session._getPredictiveCompactionSettings = () => session.settingsManager.getCompactionSettings(
    enabled ? compactionModel ?? session._limitsModel() : session.model);
  session._getPredictiveCompactionUsage = () => {
    if (!enabled) return undefined;
    const usage = session.getContextUsage();
    const contextWindow = (compactionModel ?? session._limitsModel())?.contextWindow ?? usage?.contextWindow;
    // Pi reports unknown provider usage until the first response after compaction.
    const tokens = Number.isFinite(usage?.tokens) ? usage.tokens
      : estimateProjectedTokens(session.sessionManager.buildSessionProjection(), session.sessionManager.getBranch()).tokens;
    return { tokens, contextWindow, percent: contextWindow > 0 ? tokens / contextWindow * 100 : null };
  };
}
