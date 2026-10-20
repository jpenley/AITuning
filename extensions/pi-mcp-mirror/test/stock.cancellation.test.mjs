import assert from 'node:assert/strict';
import { test } from 'node:test';
import { booleanForm, bounded, setup, until } from './stock.fixture.mjs';

// Break caught: an operation cancelled during final review can still accept a late
// dialog answer, or cancellation abandons the live remote request/UI cleanup.
test('real session abort invalidates a pending final consent and never accepts a late answer', { concurrency: false, timeout: 20000 }, async () => {
  const h = await setup({ form: booleanForm, holdConsent: true });
  try {
    await h.ready();
    assert.deepEqual(h.capabilities?.elicitation, { form: {} });
    const work = h.beginTool('codemode', { code: '// @options: {"timeout_ms":5000}\nawait tools.mcp__lab_docs__ask({});' });
    // Attach before abort: a rejected prompt must not become an unhandled rejection.
    const settled = work.then(() => ({ completed: true }), error => ({ error }));
    await until(() => h.selects.length === 1, 'final consent with an active nested operation');
    assert.equal(h.wire, undefined);
    assert.equal(h.prompts.length, 1);
    await bounded(h.session.abort(), 'public AgentSession abort');
    const outcome = await settled;
    if (outcome.error) assert.match(String(outcome.error), /abort|cancel/i);
    h.releaseConsent('Accept'); // A late UI response cannot revive the invalidated scope.
    assert.equal(h.inputs.length, 0, 'cancellation must never open native fallback');
    assert.equal(h.selects.length, 1, 'cancellation must never open another consent dialog');
    assert.ok(!h.replies.some(reply => reply.id === 'wire-form' && reply.result?.action === 'accept'));
    assert.ok(h.requests.some(request => request.method === 'notifications/cancelled'), 'real MCP client must cancel the outstanding wire operation');
    assert.equal(h.requests.filter(request => request.method === 'tools/call').length, 1, 'aborted side effects must not be replayed');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
