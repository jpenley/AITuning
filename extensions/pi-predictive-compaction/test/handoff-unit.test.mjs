import test from 'node:test';
import assert from 'node:assert/strict';
import { installPredictiveHandoff } from '../sdk-handoff.mjs';

// Break caught: enabling observation must not replace native triggers or impose admission gates.
test('predictive SDK support observes context without wrapping native processing', async () => {
  let nativeCalls = 0, tools = 0;
  const model = { id: 'selected', contextWindow: 100000 };
  const session = {
    _limitsModel: () => model,
    getContextUsage: () => ({ tokens: 99000, contextWindow: 100000 }),
    sessionManager: { buildSessionProjection: () => ({ messages: [] }), getBranch: () => [] },
    _runAutoCompaction: async () => { ++nativeCalls; },
    _prepareRun: async () => 'native run',
    _beforeToolCall: async () => { ++tools; return { block: true, reason: 'Existing permission policy' }; },
    _compactBeforeNextAssistantResponse: async context => context,
    _handlePostAgentRun: async () => true,
    _runBeforeSettleBoundary: async () => true,
    agent: { prepareRequest: async request => request, finishTurn: async () => 'native turn' },
  };
  const methods = ['_prepareRun', '_beforeToolCall', '_compactBeforeNextAssistantResponse', '_handlePostAgentRun', '_runBeforeSettleBoundary'];
  const original = new Map(methods.map(name => [name, session[name]]));
  const request = session.agent.prepareRequest, finish = session.agent.finishTurn;
  installPredictiveHandoff(session, () => ({ tokens: 12345 }));
  session._setPredictiveCompactionEnabled(true);
  for (const name of methods) assert.equal(session[name], original.get(name), `${name} must remain native`);
  assert.equal(session.agent.prepareRequest, request); assert.equal(session.agent.finishTurn, finish);
  assert.equal(await session._prepareRun(), 'native run');
  assert.deepEqual(await session._beforeToolCall(), { block: true, reason: 'Existing permission policy' });
  assert.equal(tools, 1); assert.equal(nativeCalls, 0);
  assert.deepEqual(session._getPredictiveCompactionUsage(), { tokens: 99000, contextWindow: 100000, percent: 99 });
  session._setPredictiveCompactionEnabled(false);
  assert.equal(session._getPredictiveCompactionUsage(), undefined);
});

// Break caught: unknown provider usage after compaction must still support background prediction.
test('observation estimates the canonical projection with the physical model window', () => {
  const session = { _limitsModel: () => ({ contextWindow: 200000 }), getContextUsage: () => ({ tokens: null, contextWindow: 999999 }),
    sessionManager: { buildSessionProjection: () => ({ messages: [] }), getBranch: () => [] }, agent: { prepareRequest: async request => request } };
  installPredictiveHandoff(session, () => ({ tokens: 30000 })); session._setPredictiveCompactionEnabled(true);
  assert.deepEqual(session._getPredictiveCompactionUsage(), { tokens: 30000, contextWindow: 200000, percent: 15 });
});

// Break caught: an in-flight physical route must bind both window and reserve, then restore them.
test('routed native compaction observes current limits and restores them after success, failure or abort', async () => {
  for (const outcome of ['success', 'error', 'abort']) {
    const previous = { contextWindow: 272000, reserveTokens: 16384 }, route = { contextWindow: 100000, reserveTokens: 40000 };
    const session = { model: { contextWindow: 999999, reserveTokens: 1000 }, _limitsModel: () => previous,
      settingsManager: { getCompactionSettings: model => ({ reserveTokens: model.reserveTokens }) },
      getContextUsage: () => ({ tokens: 90000 }), sessionManager: { buildSessionProjection: () => ({ messages: [] }), getBranch: () => [] } };
    installPredictiveHandoff(session, () => ({ tokens: 90000 })); session._setPredictiveCompactionEnabled(true);
    const running = session._withPredictiveCompactionModel(route, async () => {
      await Promise.resolve();
      assert.equal(session._getPredictiveCompactionUsage().contextWindow, 100000);
      assert.equal(session._getPredictiveCompactionSettings().reserveTokens, 40000);
      if (outcome !== 'success') throw outcome === 'abort' ? new DOMException('Controlled route operation', 'AbortError') : new Error('Controlled route operation');
      return 'native';
    });
    if (outcome === 'success') assert.equal(await running, 'native');
    else await assert.rejects(running, /Controlled route operation/);
    assert.equal(session._getPredictiveCompactionUsage().contextWindow, 272000);
    assert.equal(session._getPredictiveCompactionSettings().reserveTokens, 16384);
    session._setPredictiveCompactionEnabled(false);
    assert.equal(session._getPredictiveCompactionSettings().reserveTokens, 1000);
  }
});
