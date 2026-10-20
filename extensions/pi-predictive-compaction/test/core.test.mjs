import test from 'node:test';
import assert from 'node:assert/strict';
import { PredictiveCompaction } from '../src/core.mjs';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const finish = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  let time = 0, calls = 0;
  const pending = [];
  const engine = new PredictiveCompaction({ now: () => time, summarize: async (_snapshot, { signal }) => {
    ++calls; const d = deferred(); pending.push({ ...d, signal }); return d.promise;
  }, finalize: (ready, view) => ({ tokensAfter: view.after ?? 10000, compaction: { summary: ready.result.summary, firstKeptEntryId: ready.snapshot.cutId } }) });
  const view = (tokens = 88000, extra = {}) => ({ scope: 'same-session', key: 'prefix1', tokens, sourceSize: 10000, window: 100000, settings: { enabled: true, reserveTokens: 10000 }, canSnapshot: true,
    accepts: snapshot => snapshot.scope === 'same-session', snapshot() { return { scope: this.scope, key: this.key, cutId: 'ORIGINAL_CUT', sourceSize: this.sourceSize }; }, ...extra });
  return { engine, view, pending, tick: n => { time += n; }, calls: () => calls };
}

test('off starts no requests; ready handoff returns original cut with no additional inference', async () => {
  const f = fixture();
  f.engine.observe(f.view()); assert.equal(f.calls(), 0);
  f.engine.setEnabled(true); f.engine.observe(f.view()); assert.equal(f.calls(), 1);
  f.pending[0].resolve({ summary: 'native summary' }); await finish();
  assert.equal(f.engine.status().phase, 'ready');
  assert.deepEqual(await f.engine.take(() => f.view(95000)), { compaction: { summary: 'native summary', firstKeptEntryId: 'ORIGINAL_CUT' } });
  assert.equal(f.calls(), 1);
  assert.deepEqual(await f.engine.take(() => f.view()), { cancel: true });
});

test('late hook joins the active Luna job exactly once', async () => {
  const f = fixture(); f.engine.setEnabled(true); f.engine.observe(f.view());
  const handoff = f.engine.take(() => f.view());
  assert.equal(f.calls(), 1); assert.equal(f.engine.status().metrics.waits, 1);
  f.pending[0].resolve({ summary: 'waited' });
  assert.equal((await handoff).compaction.summary, 'waited'); assert.equal(f.calls(), 1);
});

test('adaptive lead uses observed active growth and whole-job latency; idle time is excluded', async () => {
  const f = fixture(); f.engine.setEnabled(true); f.engine.observe(f.view(10000));
  f.tick(1000); f.engine.observe(f.view(12000));
  assert.equal(f.engine.prediction().tokensPerSecond, 2000);
  assert.equal(f.engine.prediction().leadTokens, 50000);
  f.engine.start(f.view().snapshot());
  f.pending[0].resolve({ summary: 'observed latency' }); f.tick(10000); await finish();
  assert.ok(f.engine.prediction().latencyMs >= 10000);
  const before = f.engine.prediction().tokensPerSecond;
  f.engine.observe(f.view(12000), { active: false }); f.tick(3600000);
  f.engine.observe(f.view(12001)); assert.equal(f.engine.prediction().tokensPerSecond, before);
});

test('off aborts independent background lifecycle; late completion cannot become ready', async () => {
  const f = fixture(); f.engine.setEnabled(true); f.engine.observe(f.view());
  f.engine.setEnabled(false); assert.equal(f.pending[0].signal.aborted, true);
  f.pending[0].resolve({ summary: 'discard this' }); await finish();
  assert.equal(f.engine.status().phase, 'off'); assert.equal(f.engine.ready, undefined);
});

test('provider rejection on abort is counted as one discarded job; hook abort also releases the handoff', async () => {
  let rejectCall;
  const engine = new PredictiveCompaction({ summarize: (_snapshot, { signal }) => new Promise((_, reject) => {
    rejectCall = reject; signal.addEventListener('abort', () => reject(new Error('Provider AbortError')), { once: true });
  }), finalize: () => ({ tokensAfter: 0 }) });
  const f = fixture(); engine.setEnabled(true); engine.observe(f.view());
  const job = engine.active; engine.setEnabled(false); await job.promise;
  assert.equal(engine.status().metrics.discarded, 1); assert.equal(engine.status().metrics.failed, 0);
  engine.setEnabled(true);
  const aborter = new AbortController();
  const take = engine.take(() => f.view(), { signal: aborter.signal });
  aborter.abort(); assert.deepEqual(await take, { cancel: true });
  assert.equal(engine.consuming, false);
  rejectCall(new Error('Settled abort')); await new Promise(resolve => setImmediate(resolve));
});

test('context edits invalidate ready checkpoints; budget never trims protected content', async () => {
  const f = fixture(); f.engine.setEnabled(true); f.engine.observe(f.view());
  f.pending[0].resolve({ summary: 'exact directives' }); await finish();
  const answer = await f.engine.take(() => f.view(95000, { after: 90001 }));
  assert.deepEqual(answer, { cancel: true, failure: 'budget' }); assert.match(f.engine.status().lastError, /no required text was removed/);
  f.engine.observe(f.view(10000, { key: 'edited', accepts: () => false }));
  assert.equal(f.engine.ready, undefined);
});

test('unknown usage and unresolved current step cannot launch speculative requests', () => {
  const f = fixture(); f.engine.setEnabled(true);
  f.engine.observe(f.view(null)); f.engine.observe(f.view(95000, { canSnapshot: false }));
  assert.equal(f.calls(), 0);
});

test('a ready checkpoint survives while a newer replacement is building', async () => {
  const f = fixture(); f.engine.setEnabled(true); f.engine.observe(f.view());
  f.pending[0].resolve({ summary: 'older valid' }); await finish();
  f.engine.observe(f.view(89000, { key: 'prefix2', after: 16000, sourceSize: 20000 })); assert.equal(f.calls(), 2);
  assert.equal(f.engine.ready.result.summary, 'older valid');
  const result = await f.engine.take(() => f.view(90000, { key: 'prefix2', after: 16000 }));
  assert.equal(result.compaction.summary, 'older valid');
  f.engine.invalidate('committed'); f.pending[1].resolve({ summary: 'late replacement' }); await finish();
  assert.equal(f.engine.ready, undefined);
});

test('an over-budget ready checkpoint joins its active replacement instead of canceling early', async () => {
  const f = fixture(); f.engine.setEnabled(true); f.engine.observe(f.view());
  f.pending[0].resolve({ summary: 'old' }); await finish();
  f.engine.observe(f.view(89000, { key: 'prefix2', after: 16000, sourceSize: 20000 }));
  const view = () => f.view(90000, { key: 'prefix2' });
  f.engine.finalize = (ready) => ({ tokensAfter: ready.result.summary === 'old' ? 85000 : 10000, compaction: { summary: ready.result.summary } });
  const result = f.engine.take(view); assert.equal(f.calls(), 2);
  f.pending[1].resolve({ summary: 'fresh' });
  assert.equal((await result).compaction.summary, 'fresh');
});

test('custom manual instructions get a fresh Luna summary, never the generic checkpoint', async () => {
  const f = fixture(); f.engine.setEnabled(true); f.engine.observe(f.view());
  f.pending[0].resolve({ summary: 'generic' }); await finish();
  const handoff = f.engine.take(() => f.view(), { customInstructions: 'Focus on API migration' });
  assert.equal(f.calls(), 2);
  f.pending[1].resolve({ summary: 'API migration' });
  assert.equal((await handoff).compaction.summary, 'API migration');
});

test('handoff telemetry records late and blocking waits separately from native commit acknowledgement', async () => {
  const f = fixture(), events = []; f.engine.record = (event, data) => events.push({ event, ...data });
  f.engine.setEnabled(true); f.engine.observe(f.view());
  const handoff = f.engine.take(() => f.view());
  f.tick(25); f.pending[0].resolve({ summary: 'joined' });
  assert.equal((await handoff).compaction.summary, 'joined');
  assert.ok(events.some(e => e.event === 'wait_finished' && e.reason === 'late' && e.waitMs === 25 && e.outcome === 'success'));
  assert.ok(events.some(e => e.event === 'compaction_prepared' && e.accepted));
  assert.equal(events.some(e => e.event === 'compaction_committed'), false);
  f.engine.invalidate('session_compact');
  const blocking = f.engine.take(() => f.view());
  f.tick(50); f.pending[1].resolve({ summary: 'blocking' });
  assert.equal((await blocking).compaction.summary, 'blocking');
  assert.ok(events.some(e => e.event === 'blocking_started'));
  assert.ok(events.some(e => e.event === 'wait_finished' && e.reason === 'blocking' && e.waitMs === 50));
});

test('ready-only manual handoff never starts or waits for speculative inference', async () => {
  const f = fixture(); f.engine.setEnabled(true); f.engine.observe(f.view());
  assert.deepEqual(await f.engine.take(() => f.view(), { readyOnly: true }), { cancel: true, failure: 'checkpoint_missing' });
  assert.equal(f.calls(), 1); assert.equal(f.engine.status().metrics.waits, 0); assert.equal(f.engine.status().metrics.blocking, 0);
  f.pending[0].resolve({ summary: 'ready for reuse' }); await finish();
  assert.equal((await f.engine.take(() => f.view(), { readyOnly: true })).compaction.summary, 'ready for reuse');
  assert.equal(f.calls(), 1);
});

test('unchanged summarization input is not refreshed merely because the raw tail grows', async () => {
  const f = fixture(); f.engine.setEnabled(true);
  f.engine.observe(f.view(88000, { inputKey: 'same-prefix', snapshot() { return { scope: this.scope, key: this.key, inputKey: this.inputKey, cutId: 'cut' }; } }));
  f.pending[0].resolve({ summary: 'ready' }); await finish();
  f.engine.observe(f.view(95000, { key: 'new-tail', inputKey: 'same-prefix', after: 19000 }));
  assert.equal(f.calls(), 1);
});

test('a joined provider failure is explicit and does not launch another predictive attempt', async () => {
  const f = fixture(); f.engine.setEnabled(true);
  f.engine.summarize = async () => { throw new Error('Controlled provider failure'); };
  f.engine.observe(f.view());
  assert.deepEqual(await f.engine.take(() => f.view()), { cancel: true, failure: 'provider' });
  assert.equal(f.engine.metrics.started, 1); assert.equal(f.engine.metrics.failed, 1);
});

test('provider abort is cancellation, not permission for fallback', async () => {
  const f = fixture(); f.engine.setEnabled(true);
  f.engine.summarize = async () => { throw new DOMException('Provider aborted', 'AbortError'); };
  f.engine.observe(f.view());
  assert.deepEqual(await f.engine.take(() => f.view()), { cancel: true });
  assert.equal(f.engine.metrics.failed, 0);
});

test('near-simultaneous observations use a bounded growth interval and lead', () => {
  const f = fixture(); f.engine.setEnabled(true);
  f.engine.observe(f.view(1000)); f.tick(0.1); f.engine.observe(f.view(2000));
  assert.equal(f.engine.prediction().tokensPerSecond, 1000);
  assert.equal(f.engine.prediction().leadTokens, 50000);
});

test('configured predictive timeout is an error even when a provider ignores cancellation', async () => {
  const f = fixture(); f.engine.setEnabled(true); f.engine.options.timeoutMs = 5;
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    assert.deepEqual(await f.engine.take(() => f.view()), { cancel: true, failure: 'timeout' });
    assert.equal(f.pending[0].signal.aborted, true); assert.equal(f.engine.metrics.started, 1);
    f.pending[0].resolve({ summary: 'Too late' }); await finish(); assert.equal(f.engine.ready, undefined);
  } finally { clearTimeout(keepAlive); }
});

test('a changed context cancels a waiting handoff even if its provider then fails', async () => {
  for (const observe of [false, true]) {
    const f = fixture(); f.engine.setEnabled(true); let current = f.view();
    f.engine.observe(current); const taking = f.engine.take(() => current);
    current = f.view(90000, { scope: 'new-context', accepts: () => false });
    if (observe) f.engine.observe(current);
    f.pending[0].resolve(Promise.reject(new Error('Provider failure after context changed')));
    assert.deepEqual(await taking, { cancel: true });
  }
});

test('a failed intervening preparation cannot refresh unchanged ready input', async () => {
  const f = fixture(); f.engine.setEnabled(true); const original = f.view(88000, { after: 16000 });
  f.engine.observe(original); f.pending[0].resolve({ summary: 'Checkpoint A' }); await finish();
  const replacement = { ...original.snapshot(), key: 'different-consolidation-input' };
  const job = f.engine.start(replacement); f.pending[1].resolve(Promise.reject(new Error('Consolidation failed'))); await job.promise;
  f.engine.observe(original); assert.equal(f.calls(), 2);
});

// Break caught: the retired 79% anchor starts speculative inference too early.
test('background preparation leads the effective native reserve boundary, not a fixed context percentage', async () => {
  for (const [reserveTokens, before, due] of [[10000, 50000, 55184], [40000, 20000, 25184]]) {
    const f = fixture(); f.engine.setEnabled(true);
    f.engine.observe(f.view(before, { settings: { enabled: true, reserveTokens } }));
    assert.equal(f.calls(), 0, 'preparation must wait until adaptive lead reaches the native boundary');
    // Keep time unchanged so this probes the cold lead, not measured growth.
    f.engine.observe(f.view(due, { settings: { enabled: true, reserveTokens } }));
    assert.equal(f.calls(), 1, 'the effective reserve must move the preparation boundary');
    f.engine.setEnabled(false); await f.engine.active?.promise;
  }
});
