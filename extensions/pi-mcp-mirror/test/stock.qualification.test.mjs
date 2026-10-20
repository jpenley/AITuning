import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertChain, booleanForm, bounded, control, integerForm, ordinaryTools, setup, until } from './stock.fixture.mjs';

// Deliberately serial: each fixture isolates the process environment before SDK creation.
const options = { concurrency: false, timeout: 30000 };
const emit = expression => `text('QUAL:' + JSON.stringify(${expression}));`;

async function ordinaryQualification(factory) {
  const h = await setup({ factory, collector: factory !== 'native' });
  try {
    await h.ready();
    await until(() => h.session.getActiveToolNames().includes('tool_search'), 'native discovery activation');
    assert.ok(h.session.getActiveToolNames().includes('codemode'), 'MCP must activate actual stock Codemode');
    assert.equal(h.api.getCommands().filter(command => command.name === 'mcp').length, 1, 'exactly one session connector owns /mcp');
    const metadata = h.session.getAllTools().filter(t => t.name.startsWith('mcp__')).map(t => ({
      name: t.name, description: t.description, parameters: t.parameters, outputSchema: h.session.getToolDefinition(t.name)?.outputSchema,
      namespace: t.namespace, exposure: t.exposure, annotations: t.annotations,
    })).sort((a, b) => a.name.localeCompare(b.name));
    const echo = metadata.find(t => t.name === 'mcp__lab_docs__echo');
    assert.deepEqual(echo.parameters, { type: 'object', properties: { value: { type: 'integer' } }, required: ['value'] });
    assert.deepEqual(echo.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    assert.deepEqual(echo.namespace.aliases, ['lab-docs']);
    assert.equal(echo.namespace.instructions, 'Offline laboratory.\nKeep complete structured results.');
    assert.equal(echo.exposure, 'deferred', 'native codemode exposure is callable but not inline-listed');
    const collisions = metadata.filter(t => /colliding spelling/.test(t.description));
    assert.equal(collisions.length, 2);
    assert.notEqual(collisions[0].name, collisions[1].name);
    for (const collision of collisions) assert.match(collision.name, /^mcp__lab_docs__read_item_[a-f0-9]{8}$/);
    const hidden = metadata.find(t => t.name === 'mcp__lab_docs__secret');
    assert.equal(hidden.exposure, 'hidden');
    assert.ok(!h.session.getCallableToolNames().includes(hidden.name));
    for (const tool of h.session.getAllTools().filter(t => t.name.startsWith('mcp__'))) {
      assert.equal(tool.sourceInfo.origin, 'top-level', 'MCP provenance must come from real loaded wrapper, not fabricated builtin provenance');
      assert.ok(tool.sourceInfo.path.endsWith('qualification.ts'));
    }
    const outcome = await h.script(`
      const first = await tools.mcp__lab_docs__echo({value: 0});
      const failure = await tools.mcp__lab_docs__failed({});
      const a = await describeNamespace('lab-docs');
      const b = await describeNamespace('lab_docs');
      const c = await describeNamespace('mcp__lab-docs');
      const d = await describeNamespace('mcp__lab_docs');
      const collisionNames = ALL_TOOLS.filter(t => /colliding spelling/.test(t.description)).map(t => t.name).sort();
      const collisionResults = [];
      for (const name of collisionNames) collisionResults.push(await tools[name]({}));
      ${emit(`{first: {length: first.content[0].text.length, head: first.content[0].text.slice(0,6), tail: first.content[0].text.slice(-14), data: first.structuredContent, isError: first.isError, leakedMeta: Object.prototype.hasOwnProperty.call(first, '_meta')}, failure, namespaces: [a,b,c,d], collisionNames, collisionResults, hidden: ALL_TOOLS.some(t => t.name === 'mcp__lab_docs__secret'), discovery: await searchTools('needle', {namespace:'lab-docs'})}`)}
    `);
    assert.deepEqual(outcome.first, { length: 26020, head: 'start:', tail: ':complete-tail', data: { flag: false, count: 0 }, isError: false, leakedMeta: false });
    assert.deepEqual(outcome.failure, { content: [{ type: 'text', text: 'remote failure with data' }], structuredContent: { flag: false, count: 0 }, isError: true });
    assert.equal(outcome.hidden, false);
    assert.deepEqual(outcome.discovery.map(t => t.name), ['mcp__lab_docs__discover']);
    assert.ok(outcome.namespaces.every(ns => ns.instructions === 'Offline laboratory.\nKeep complete structured results.'));
    for (const ns of outcome.namespaces.slice(1)) assert.deepEqual(ns, outcome.namespaces[0]);
    assert.deepEqual(outcome.collisionResults.map(r => r.content[0].text).sort(), ['read-item', 'read.item']);
    const outer = h.calls.find(c => c.toolName === 'codemode');
    const nested = h.calls.filter(c => c.toolName.startsWith('mcp__'));
    assert.equal(nested.length, 4, 'one real host dispatch per script call');
    for (const child of nested) {
      assert.equal(child.parentToolCallId, outer.toolCallId);
      assert.ok(h.results.some(r => r.toolCallId === child.toolCallId && r.parentToolCallId === outer.toolCallId));
    }
    assert.equal(h.results.find(r => r.toolName === 'mcp__lab_docs__failed').isError, true);
    const echoCall = nested.find(c => c.toolName === 'mcp__lab_docs__echo');
    assert.ok(h.lifecycle.some(event => event.type === 'tool_execution_update' && event.toolCallId === echoCall.toolCallId && event.parentToolCallId === outer.toolCallId), 'wire progress must traverse the real nested execution event pipeline');
    assert.equal(h.session.messages.filter(m => m.role === 'toolResult' && m.toolName.startsWith('mcp__')).length, 0, 'nested results must not become top-level transcript entries');
    const search = await h.runTool('tool_search', { query: 'needle', limit: 1 });
    assert.equal(search.isError, false);
    assert.ok(h.session.getActiveToolNames().includes('mcp__lab_docs__discover'), 'actual stock tool_search must activate its match');
    h.api.setActiveTools([...h.api.getActiveTools(), 'mcp__lab_docs__failed']);
    const direct = await h.runTool('mcp__lab_docs__failed', {});
    assert.equal(direct.isError, true, 'wire isError resolves as data in scripts but fails direct calls');
    assert.match(direct.content[0].text, /remote failure with data/);
    assert.equal(h.requests.filter(r => r.method === 'initialize').length, 1, 'must not run both native and mirror connectors');
    assert.equal(h.requests.filter(r => r.method === 'tools/call').length, 5, 'no tool side-effect replay');
    return { metadata, outcome, directError: direct.isError };
  } finally { await h.close(); }
}

// Break caught: names/hash rules, aliases, metadata, script result semantics or discovery diverge from pristine native.
test('ordinary MCP matches pristine native through public stock SDK, Codemode and tool_search', options, async () => {
  const native = await ordinaryQualification('native');
  const candidate = await ordinaryQualification(control);
  assert.deepEqual(candidate, native, 'compare semantic outcomes; do not normalize metadata or structured results');
});

// Break caught: connector registers tools after actual Codemode has captured its callable snapshot.
test('a slow tools/list finishes before stock Codemode snapshots callable tools', options, async () => {
  const h = await setup({ slow: true });
  try {
    await bounded(h.listSeen, 'slow server tools/list');
    assert.ok(!h.session.getAllTools().some(t => t.name === 'mcp__lab_docs__echo'));
    const work = h.script(`const r = await tools.mcp__lab_docs__echo({value:0}); ${emit('r.structuredContent')}`);
    try {
      await until(() => h.calls.some(c => c.toolName === 'codemode'), 'real Codemode permission hook while server is not ready');
    } finally { h.respondList(); }
    assert.deepEqual(await work, { flag: false, count: 0 });
    assertChain(h, ['codemode', 'mcp__lab_docs__echo']);
  } finally { await h.close(); }
});

// Break caught: nested permission denial is bypassed or the connector executes a side effect anyway.
test('a real host gate blocks Codemode MCP dispatch without a wire tools/call', options, async () => {
  for (const factory of ['native', control]) {
    const h = await setup({ factory, deny: 'mcp__lab_docs__echo' });
    try {
      await h.ready();
      const outcome = await h.script(`let denied = false; try { await tools.mcp__lab_docs__echo({value:0}); } catch(e) { denied = /Offline permission denial/.test(e.message); } ${emit('{denied}')}`);
      assert.deepEqual(outcome, { denied: true });
      assert.equal(h.requests.filter(r => r.method === 'tools/call').length, 0);
      assert.equal(h.calls.filter(c => c.toolName === 'mcp__lab_docs__echo').length, 1);
    } finally { await h.close(); }
  }
});

async function formFixture(extra = {}) {
  const h = await setup({ form: booleanForm, ...extra });
  try {
    await h.ready();
    // The native control MUST reach this assertion (not fail to import mirror).
    // Stock native omits form advertisement despite the same collector being loaded.
    assert.ok(h.session.getAllTools().some(t => t.name === 'mcp_elicitation_v1'), 'public factory must register its sibling collector');
    const rpiv = h.session.getAllTools().find(t => t.name === 'ask_user_question');
    assert.equal(rpiv?.sourceInfo.origin, 'package', 'real package provenance is required for RPIV recognition');
    assert.deepEqual(h.capabilities?.elicitation, { form: {} }, 'form capability must be advertised only with the operation-scoped collector');
    return h;
  } catch (error) { await h.close(); throw error; }
}
const formScript = `const reply = await tools.mcp__lab_docs__ask({}); ${emit('JSON.parse(reply.content[0].text)')}`;

// Break caught: false coerced, explicit consent bypassed, RPIV provenance forged, or any nested host dispatch omitted.
test('actual Codemode -> mirror -> collector -> real RPIV sends false only after explicit consent', options, async () => {
  const h = await formFixture({ holdConsent: true });
  try {
    const work = h.script(formScript);
    try {
      await until(() => h.selects.length === 1, 'explicit final consent after real RPIV answer');
      assert.equal(h.wire, undefined, 'an RPIV answer alone must not send values');
      assert.equal(h.prompts.length, 1);
      assert.equal(h.inputs.length, 0, 'native fallback must remain unused');
      assert.match(h.selects[0].title, /final consent/);
      assert.match(h.selects[0].title, /flag = false/);
    } finally { h.releaseConsent('Accept'); }
    const expected = { jsonrpc: '2.0', id: 'wire-form', result: { action: 'accept', content: { flag: false } } };
    assert.deepEqual(await work, expected);
    assert.deepEqual(h.wire, expected);
    assertChain(h, ['codemode', 'mcp__lab_docs__ask', 'mcp_elicitation_v1', 'ask_user_question']);
    assert.equal(h.results.find(r => r.toolName === 'ask_user_question').isError, false);
    assert.equal(h.requests.filter(r => r.method === 'tools/call').length, 1);
  } finally { await h.close(); }
});

// Break caught: provider denial is swallowed, accepted, or retried through native UI.
test('real RPIV permission denial yields a technical wire error with zero fallback', options, async () => {
  const h = await formFixture({ deny: 'ask_user_question' });
  try {
    const wire = await h.script(formScript);
    assert.equal(wire.error.code, -32603);
    assert.equal(Object.hasOwn(wire, 'result'), false);
    assert.equal(h.prompts.length, 0);
    assert.equal(h.selects.length, 0);
    assert.equal(h.inputs.length, 0);
    assert.equal(h.calls.filter(c => c.toolName === 'ask_user_question').length, 1);
    assert.equal(h.results.find(r => r.toolName === 'mcp_elicitation_v1').isError, true);
  } finally { await h.close(); }
});

for (const [final, action] of [['Decline', 'decline'], ['Cancel', 'cancel'], [undefined, 'cancel']]) {
  // Break caught: final decline/cancel/window dismissal leaks collected answers or triggers fallback.
  test(`final ${final ?? 'dialog dismissal'} never sends the RPIV values`, options, async () => {
    // undefined is selected through a held dialog because setup's default is Accept.
    const h = await formFixture({ holdConsent: true });
    try {
      const work = h.script(formScript);
      await until(() => h.selects.length === 1, 'final consent dialog');
      h.releaseConsent(final);
      assert.deepEqual(await work, { jsonrpc: '2.0', id: 'wire-form', result: { action } });
      assert.equal(h.prompts.length, 1);
      assert.equal(h.inputs.length, 0);
      assertChain(h, ['codemode', 'mcp__lab_docs__ask', 'mcp_elicitation_v1', 'ask_user_question']);
    } finally { await h.close(); }
  });
}

// Break caught: cancelling the actual RPIV questionnaire opens final consent or native fallback anyway.
test('RPIV public answer cancellation sends cancel without consent or native fallback', options, async () => {
  const h = await formFixture({ cancelRpiv: true });
  try {
    assert.deepEqual(await h.script(formScript), { jsonrpc: '2.0', id: 'wire-form', result: { action: 'cancel' } });
    assert.equal(h.prompts.length, 1);
    assert.equal(h.selects.length, 0);
    assert.equal(h.inputs.length, 0);
  } finally { await h.close(); }
});

// Break caught: integer fallback starts RPIV first, or falsy numeric zero is omitted/coerced.
test('unsupported RPIV integer form chooses native collection before any RPIV call and preserves zero', options, async () => {
  const h = await formFixture({ form: integerForm });
  try {
    assert.deepEqual(await h.script(formScript), { jsonrpc: '2.0', id: 'wire-form', result: { action: 'accept', content: { count: 0 } } });
    assert.equal(h.prompts.length, 0);
    assert.equal(h.calls.filter(c => c.toolName === 'ask_user_question').length, 0);
    assert.equal(h.inputs.length, 1);
    assert.equal(h.selects.length, 1);
    assert.match(h.selects[0].title, /final consent/);
    assertChain(h, ['codemode', 'mcp__lab_docs__ask', 'mcp_elicitation_v1']);
  } finally { await h.close(); }
});

// Break caught: late registrations are ignored, tool-list changes leave stale tools callable, or unregister leaves a live connection.
test('late public server registration, resource calls and withdrawal retain native lifecycle behavior', options, async () => {
  for (const factory of ['native', control]) {
    const h = await setup({ factory, registeredOnly: true });
    try {
      assert.equal(h.requests.filter(r => r.method === 'initialize').length, 0);
      h.register();
      await h.ready();
      const resources = await h.script(`
        const list = await tools.list_mcp_resources({server:'lab-docs'});
        const read = await tools.read_mcp_resource({server:'lab-docs',uri:'memory://note'});
        ${emit('{list,read}')}
      `);
      assert.deepEqual(resources.list, { server: 'lab-docs', resources: [{ server: 'lab-docs', uri: 'memory://note', name: 'note', mimeType: 'text/plain' }] });
      assert.deepEqual(resources.read, { server: 'lab-docs', uri: 'memory://note', contents: [{ uri: 'memory://note', mimeType: 'text/plain', text: 'offline resource value' }] });
      await h.changeTools(ordinaryTools.filter(t => t.name !== 'echo'));
      await until(() => !h.session.getCallableToolNames().includes('mcp__lab_docs__echo'), 'tools/list_changed withdrawal');
      const stale = await h.script(`let failed=false; try { await tools.mcp__lab_docs__echo({value:0}); } catch(e) { failed=true; } ${emit('{failed}')}`);
      assert.deepEqual(stale, { failed: true });
      assert.equal(h.requests.filter(r => r.method === 'tools/call').length, 0, 'withdrawn tools must not reach remote peer');
      h.withdraw();
      await until(() => !h.session.getCallableToolNames().some(n => n.startsWith('mcp__lab_docs__')), 'registered server withdrawal');
      assert.equal(h.requests.filter(r => r.method === 'initialize').length, 1);
    } finally { await h.close(); }
  }
});

// Break caught: advertising or accepting forms without real UI, or bypassing the
// collector tool's own host gate because the outer MCP tool was permitted.
test('print mode never advertises forms and unsolicited elicitation opens no UI', options, async () => {
  const h = await setup({ factory: 'mirror', form: booleanForm, interactive: false });
  try {
    await h.ready();
    assert.equal(h.capabilities.elicitation, undefined);
    await h.script(`await tools.mcp__lab_docs__ask({}); ${emit('true')}`);
    assert.equal(h.wire.error.code, -32601);
    assert.equal(h.prompts.length, 0);
    assert.equal(h.selects.length, 0);
    assert.equal(h.inputs.length, 0);
  } finally { await h.close(); }
});

test('collector host denial rejects the wire request before any question or fallback', options, async () => {
  const h = await formFixture({ deny: 'mcp_elicitation_v1' });
  try {
    await h.script(`await tools.mcp__lab_docs__ask({}); ${emit('true')}`);
    assert.equal(h.wire.error.code, -32603);
    assert.ok(h.calls.some(call => call.toolName === 'mcp_elicitation_v1'));
    assert.equal(h.prompts.length, 0);
    assert.equal(h.selects.length, 0);
    assert.equal(h.inputs.length, 0);
  } finally { await h.close(); }
});
