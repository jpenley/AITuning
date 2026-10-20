/** Size goals are advisory. Progress and effective-window headroom are mandatory. */
export function assessCompaction(packet, view, { target = 0.15, tolerance = 0.20, burstTokens = 4096 } = {}) {
  const before = view.estimatedTokensBefore ?? view.tokens;
  const after = packet.tokensAfter, window = view.window, reserve = view.settings?.reserveTokens;
  const floor = view.retentionFloorTokens ?? 0;
  const valid = [before, after, window, reserve, burstTokens, target, tolerance, floor].every(Number.isFinite)
    && before >= 0 && after >= 0 && window > 0 && reserve >= 0 && reserve < window
    && floor >= 0 && burstTokens >= 0 && target > 0 && tolerance >= target && tolerance < 1;
  if (!valid) return { accepted: false, budgetReason: 'invalid' };
  const headroomTokens = Math.max(4096, Math.ceil(window * 0.05), burstTokens);
  const maxAfterTokens = Math.floor(window - reserve - headroomTokens);
  const requiredSavingsTokens = Math.max(4096, Math.ceil(before * 0.10));
  const savedTokens = Math.max(0, Math.floor(before - after));
  const targetTokens = Math.max(Math.floor(window * target), floor);
  const toleranceTokens = Math.max(Math.floor(window * tolerance), floor);
  const budgetReason = after > maxAfterTokens ? 'headroom' : savedTokens < requiredSavingsTokens ? 'progress' : 'accepted';
  return { accepted: budgetReason === 'accepted', budgetReason, estimatedTokensBefore: before,
    estimatedTokensAfter: after, headroomTokens, maxAfterTokens, requiredSavingsTokens, savedTokens,
    retentionFloorTokens: floor, targetTokens, toleranceTokens, aboveTarget: after > targetTokens, aboveTolerance: after > toleranceTokens };
}
