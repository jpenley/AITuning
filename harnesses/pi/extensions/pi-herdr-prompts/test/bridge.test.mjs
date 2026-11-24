import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';

async function fixture() {
  const events = new EventEmitter();
  const reports = [];
  const handlers = new Map();
  events.on('herdr:blocked', data => reports.push(data));
  const entry = new URL('../index.ts', import.meta.url);
  // Missing installation must fail the behavior assertion, not just an import.
  if (existsSync(entry)) {
    const { default: register } = await import(entry);
    register({ events, on: (name, handler) => handlers.set(name, handler) });
  }
  return { events, reports, emit: (type, fields = {}) => handlers.get(type)?.({ type, reason: "ui_prompt", ...fields }) };
}

// Break: a mismatched event name leaves herdr working while the dialog waits.
test('opening and closing a questionnaire reports a paired herdr wait', async () => {
  const { events, reports } = await fixture();
  events.emit('rpiv:ask-user:blocked', { active: true, toolCallId: 'question-1' });
  assert.deepEqual(reports, [{ active: true, label: 'Waiting for user input' }]);
  events.emit('rpiv:ask-user:blocked', { active: false, toolCallId: 'question-1' });
  assert.deepEqual(reports.map(report => report.active), [true, false]);
});

// Break: filtering or coalescing paired waits clears the status too early.
test('concurrent questionnaires retain one open and close event each', async () => {
  const { events, reports } = await fixture();
  for (const [active, toolCallId] of [[true, 'a'], [true, 'b'], [false, 'a'], [false, 'b']]) {
    events.emit('rpiv:ask-user:blocked', { active, toolCallId, futureField: 'ignored' });
  }
  assert.deepEqual(reports.map(report => report.active), [true, true, false, false]);
  assert.ok(reports.every(report => Object.keys(report).sort().join(',') === 'active,label'));
});

// Break: a malformed event decrements herdr's counter or throws on null.
test('malformed events cannot change herdr status', async () => {
  const { events, reports } = await fixture();
  for (const data of [undefined, null, true, 'waiting', {}, { active: 'false' }, { active: 0 }]) {
    events.emit('rpiv:ask-user:blocked', data);
  }
  assert.deepEqual(reports, []);
});

// Break: an approval waits on ctx.ui.confirm but only questionnaire events reach herdr.
test('native confirmation waits report blocked until the dialog closes', async () => {
  const { emit, reports } = await fixture();
  emit('ui_prompt_start', { kind: 'confirm', title: 'Private approval details' });
  assert.deepEqual(reports, [{ active: true, label: 'Waiting for user input' }]);
  emit('ui_prompt_end', { kind: 'confirm', title: 'Private approval details' });
  assert.deepEqual(reports.map(report => report.active), [true, false]);
});

// Break: input, selector, or editor dialogs are omitted from native coverage.
for (const kind of ['select', 'input', 'editor']) {
  test(`native ${kind} waits are paired without exposing the title`, async () => {
    const { emit, reports } = await fixture();
    emit('ui_prompt_start', { kind, title: 'Sensitive prompt data' });
    emit('ui_prompt_end', { kind, title: 'Sensitive prompt data' });
    assert.deepEqual(reports, [
      { active: true, label: 'Waiting for user input' },
      { active: false, label: 'Waiting for user input' },
    ]);
  });
}

// Break: displaying a fleet viewer or progress overlay falsely blocks the agent.
test('generic custom components and unknown kinds do not report waits', async () => {
  const { emit, reports } = await fixture();
  for (const kind of ['custom', 'future-kind']) {
    emit('ui_prompt_start', { kind });
    emit('ui_prompt_end', { kind });
  }
  assert.deepEqual(reports, []);
});

// Break: a native close consumes the questionnaire's contribution to herdr's count.
test('native dialogs and questionnaires keep independently balanced contributions', async () => {
  const { events, emit, reports } = await fixture();
  events.emit('rpiv:ask-user:blocked', { active: true, toolCallId: 'question' });
  emit('ui_prompt_start', { kind: 'input' });
  emit('ui_prompt_end', { kind: 'input' });
  events.emit('rpiv:ask-user:blocked', { active: false, toolCallId: 'question' });
  assert.deepEqual(reports.map(report => report.active), [true, true, false, false]);
});

// Break: duplicate/out-of-order lifecycle notifications leak a count across reload.
test('native cleanup is balanced for duplicates, mismatched ends, and shutdown', async () => {
  const { emit, reports } = await fixture();
  emit('ui_prompt_end', { kind: 'confirm' });
  emit('ui_prompt_start', { kind: 'confirm' });
  emit('ui_prompt_start', { kind: 'confirm' });
  emit('ui_prompt_end', { kind: 'custom' });
  emit('ui_prompt_end', { kind: 'input' });
  assert.deepEqual(reports.map(report => report.active), [true]);
  emit('session_shutdown');
  emit('session_shutdown');
  emit('ui_prompt_end', { kind: 'confirm' });
  assert.deepEqual(reports.map(report => report.active), [true, false]);
});

// Break: persisted blockers disappear from Herdr when their questionnaire closes.
test('task blockers retain a separate balanced wait through dialogs and shutdown', async () => {
  const { events, emit, reports } = await fixture();
  emit('session_start');
  await new Promise(resolve => setImmediate(resolve));
  events.emit('task-guard:blocked', { active: true, reason: 'private blocker' });
  events.emit('task-guard:blocked', { active: true });
  emit('ui_prompt_start', { kind: 'input' });
  emit('ui_prompt_end', { kind: 'input' });
  events.emit('rpiv:ask-user:blocked', { active: true, toolCallId: 'question' });
  events.emit('rpiv:ask-user:blocked', { active: false, toolCallId: 'question' });
  assert.deepEqual(reports.map(report => report.active), [true, true, false, true, false]);
  assert.equal(reports[0].label, 'Waiting for external task action');
  assert.ok(!JSON.stringify(reports).includes('private blocker'));
  emit('session_shutdown');
  emit('session_shutdown');
  events.emit('task-guard:blocked', { active: false });
  assert.deepEqual(reports.map(report => report.active), [true, true, false, true, false, false]);
});

// Break: the task guard initializes before Herdr and its blocked report is lost.
test('task waits received before session initialization are replayed once', async () => {
  const { events, emit, reports } = await fixture();
  events.emit('task-guard:blocked', { active: true });
  assert.deepEqual(reports, []);
  emit('session_start');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(reports, [{ active: true, label: 'Waiting for external task action' }]);
  events.emit('task-guard:blocked', { active: false });
  events.emit('task-guard:blocked', { active: false });
  assert.deepEqual(reports.map(report => report.active), [true, false]);
});
