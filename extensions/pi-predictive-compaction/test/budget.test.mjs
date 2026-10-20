import test from 'node:test';
import assert from 'node:assert/strict';
import { PredictiveCompaction } from '../src/core.mjs';
import { assessCompaction } from '../src/budget.mjs';

// Break caught: rejecting a material, safe reduction solely because fixed overhead exceeds 20%.
test('the observed 72,697-token checkpoint is usable in a 272k window without another preparation', async () => {
  let calls = 0;
  const snapshot = { scope: 'incident', key: 'frozen', inputKey: 'input', cutId: 'original-cut', sourceSize: 140000 };
  const view = { scope: 'incident', key: 'frozen', inputKey: 'input', sourceSize: 140000,
    tokens: 216072, estimatedTokensBefore: 216072, window: 272000, retentionFloorTokens: 69944,
    settings: { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 }, canSnapshot: true,
    accepts: value => value.scope === 'incident', snapshot: () => snapshot };
  const engine = new PredictiveCompaction({
    summarize: async () => { ++calls; return { summary: 'Useful summary with exact directives' }; },
    finalize: ready => ({ tokensAfter: 72697, protectedTokens: 360, tailTokens: 20006, summaryTokens: 3113, overheadTokens: 49450,
      compaction: { summary: ready.result.summary, firstKeptEntryId: ready.snapshot.cutId } }),
  });
  engine.setEnabled(true);
  await engine.start(snapshot).promise;
  const result = await engine.take(() => view);
  assert.equal(result.compaction?.firstKeptEntryId, 'original-cut');
  assert.equal(result.compaction?.summary, 'Useful summary with exact directives');
  assert.equal(calls, 1);
});

// Break caught: a soft target miss used to throw away a ready result or fund another job.
for (const mode of ['changed input', 'active replacement', 'small refresh']) {
  test(`a safe ready result above the soft goal wins over ${mode}`, async () => {
    let calls = 0, release;
    const view = key => ({ scope: 'same', key, inputKey: key, tokens: 216072, estimatedTokensBefore: 216072,
      window: 272000, sourceSize: key === 'A' ? 140000 : 140001, retentionFloorTokens: 69944,
      settings: { reserveTokens: 16384, enabled: true }, canSnapshot: true, accepts: s => s.scope === 'same',
      snapshot() { return { scope: this.scope, key: this.key, inputKey: this.inputKey, sourceSize: this.sourceSize, cutId: 'frozen-cut' }; } });
    const engine = new PredictiveCompaction({ summarize: async () => {
      if (++calls === 1) return { summary: 'Ready' };
      return new Promise(resolve => { release = () => resolve({ summary: 'Replacement' }); });
    }, finalize: ready => ({ tokensAfter: 72697, compaction: { summary: ready.result.summary, firstKeptEntryId: ready.snapshot.cutId } }) });
    engine.setEnabled(true); await engine.start(view('A').snapshot()).promise;
    let replacement;
    if (mode === 'active replacement') replacement = engine.start(view('B').snapshot());
    try {
      if (mode === 'small refresh') {
        engine.observe(view('B')); assert.equal(calls, 1, 'one changed token must not fund another preparation');
      } else {
        let answer; const taking = engine.take(() => view('B')).then(value => { answer = value; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(answer?.compaction?.summary, 'Ready', 'usable ready must not wait for another provider response');
        assert.equal(calls, mode === 'active replacement' ? 2 : 1); await taking;
      }
    } finally { release?.(); if (replacement) await replacement.promise; if (engine.active) await engine.active.promise; engine.invalidate('test'); }
  });
}

// Break caught: removing the size ceiling must not admit no-op or near-full checkpoints.
for (const [name, before, after, window, reserve, expected] of [
  ['headroom boundary', 95000, 85000, 100000, 10000, 'accepted'],
  ['one token beyond headroom', 95000, 85001, 100000, 10000, 'headroom'],
  ['native reserve wins', 95000, 45000, 100000, 50000, 'accepted'],
  ['one token beyond native reserve', 95000, 45001, 100000, 50000, 'headroom'],
  ['absolute savings boundary', 10000, 5904, 100000, 10000, 'accepted'],
  ['one token below absolute savings', 10000, 5905, 100000, 10000, 'progress'],
  ['relative savings boundary', 100000, 90000, 272000, 16384, 'accepted'],
  ['one token below relative savings', 100000, 90001, 272000, 16384, 'progress'],
  ['nonfinite result', 100000, NaN, 272000, 16384, 'invalid'],
  ['nonfinite window', 100000, 10000, Infinity, 16384, 'invalid'],
  ['reserve fills window', 100000, 10000, 100000, 100000, 'invalid'],
]) test(`adaptive budget: ${name}`, () => {
  for (const enabled of [true, false]) {
    const result = assessCompaction({ tokensAfter: after }, { tokens: before, estimatedTokensBefore: before, window, settings: { reserveTokens: reserve, enabled } });
    assert.equal(result.budgetReason, expected); assert.equal(result.accepted, expected === 'accepted');
  }
});

test('provider usage cannot manufacture savings against a smaller comparable projection', () => {
  const result = assessCompaction({ tokensAfter: 29000 }, { tokens: 216072, estimatedTokensBefore: 30000, window: 272000, settings: { reserveTokens: 16384 } });
  assert.equal(result.budgetReason, 'progress'); assert.equal(result.savedTokens, 1000);
});

// Break caught: paying twice for the same failed replacement at automatic handoff.
test('failed replacement on unchanged input stays a typed failure without another job', async () => {
  let calls = 0;
  const view = key => ({ scope: 'same', key, inputKey: key, tokens: 95000, window: 100000, sourceSize: key === 'A' ? 10000 : 30000,
    settings: { reserveTokens: 10000 }, canSnapshot: true, accepts: s => s.scope === 'same',
    snapshot() { return { scope: this.scope, key: this.key, inputKey: this.inputKey, sourceSize: this.sourceSize }; } });
  const engine = new PredictiveCompaction({ summarize: async () => { if (++calls > 1) throw new Error('Synthetic provider failure'); return { summary: 'A' }; },
    finalize: ready => ({ tokensAfter: 86000, compaction: { summary: ready.result.summary } }) });
  engine.setEnabled(true); await engine.start(view('A').snapshot()).promise;
  engine.observe(view('B')); await engine.active.promise;
  const result = await engine.take(() => view('B'));
  assert.deepEqual(result, { cancel: true, failure: 'provider' });
  assert.equal(calls, 2, 'the failed B input must not be paid for twice');
});

// Break caught: spending on a new summary when mandatory retention cannot fit at all.
test('an impossible retention floor is a budget failure before any paid preparation', async () => {
  let calls = 0;
  const view = { scope: 'floor', key: 'floor', tokens: 216072, estimatedTokensBefore: 216072, window: 272000,
    retentionFloorTokens: 250000, sourceSize: 100000, settings: { reserveTokens: 16384 }, canSnapshot: true,
    accepts: () => true, snapshot() { return { scope: this.scope, key: this.key, sourceSize: this.sourceSize }; } };
  const engine = new PredictiveCompaction({ summarize: async () => { ++calls; return { summary: 'Cannot remove mandatory text' }; },
    finalize: () => ({ tokensAfter: 251000, compaction: { summary: 'still too large' } }) });
  engine.setEnabled(true); engine.observe(view); if (engine.active) await engine.active.promise;
  const result = await engine.take(() => view);
  assert.deepEqual(result, { cancel: true, failure: 'budget' });
  assert.equal(calls, 0, 'known impossible retention must not start inference');
});

test('malformed mandatory-retention estimates are invalid rather than silently zero', () => {
  for (const retentionFloorTokens of [NaN, Infinity, -1]) {
    const assessment = assessCompaction({ tokensAfter: 72697 }, { tokens: 216072, window: 272000, retentionFloorTokens, settings: { reserveTokens: 16384 } });
    assert.equal(assessment.budgetReason, 'invalid');
  }
});
