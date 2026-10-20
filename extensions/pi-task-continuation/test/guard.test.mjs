import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerTaskContinuation } from '../src/extension.mjs';

function host(branch = [], options = {}) {
  const handlers = new Map(), tools = new Map(), commands = new Map(), notifications = [], sent = [];
  const bus = new EventEmitter(), waits = [], inputs = [];
  const events = { emit: (...args) => bus.emit(...args), on: (name, fn) => { bus.on(name, fn); return () => bus.off(name, fn); } };
  events.on('task-guard:blocked', data => waits.push(data));
  let nextId = branch.length;
  const append = entry => { branch.push({ id: `entry-${++nextId}`, ...structuredClone(entry) }); };
  const ctx = {
    hasUI: true, mode: 'tui', tools: [],
    sessionManager: { getBranch: () => branch, getSessionId: () => 'test-session' },
    ui: { notify: (...args) => notifications.push(args), setStatus: () => {}, input: async (...args) => { inputs.push(args); return undefined; } },
    isIdle: () => true,
    hasPendingMessages: () => false,
  };
  const pi = {
    events,
    on: (name, fn) => { handlers.set(name, [...(handlers.get(name) ?? []), fn]); },
    registerTool: tool => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command),
    appendEntry: (customType, data) => append({ type: 'custom', customType, data }),
    sendMessage: (message, delivery) => { sent.push({ message, delivery }); append({ type: 'custom_message', ...message }); },
  };
  registerTaskContinuation(pi, options);
  return {
    branch, ctx, tools, commands, notifications, sent, append, events, waits, inputs,
    snapshot(tasks, action = 'update') { append({ type: 'custom', customType: 'rpiv-todo-state', data: { action, tasks, nextId: 100 } }); },
    async emit(name, data = {}) {
      let result;
      for (const handler of handlers.get(name) ?? []) result = await handler(data, ctx);
      return result;
    },
    async settle(overrides = {}) {
      const result = await this.emit('agent_before_settle', { outcome: 'completed', entries: [], continue: false, context: { pendingMessages: [], canContinue: false }, ...overrides });
      for (const entry of result?.entries ?? []) append(entry);
      return result;
    },
    async blocker(params) { return tools.get('task_blocker').execute('call', params, undefined, undefined, ctx); },
    async command(args) { return commands.get('task-guard').handler(args, ctx); },
  };
}
const task = (id, status = 'pending', extra = {}) => ({ id, subject: `Task ${id}`, status, ...extra });
const textOf = entry => entry.content ?? entry.data?.text;

// Break: reporting unfinished work without requesting another provider turn.
test('a normally stopping model is nudged to continue unfinished work', async () => {
  const h = host();
  h.snapshot([task(1)]);
  const result = await h.settle();
  assert.equal(result.continue, true);
  assert.ok(result.entries.some(entry => entry.type === 'custom_message' && entry.display && /#1/.test(entry.content)));
});

// Break: treating a free-form or empty reason as permission to abandon work.
test('an explicit blocker requires both a reason and a next action', async () => {
  const h = host(); h.snapshot([task(1)]);
  const result = await h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: '' });
  assert.equal(result.isError, true);
  assert.equal((await h.settle()).continue, true);
});

// Break: one external blocker suppresses independent tasks.
test('blocked work does not stop independent actionable work', async () => {
  const h = host(); h.snapshot([task(1), task(2)]);
  const result = await h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'Database choice needed', nextAction: 'User: choose SQLite or PostgreSQL' });
  assert.notEqual(result.isError, true);
  const boundary = await h.settle();
  assert.equal(boundary.continue, true);
  assert.match(boundary.entries.at(-1).content, /#2/);
});

// Break: silently waiting, or restarting despite a user cancellation.
test('all-blocked and cancelled runs report why they stop without continuing', async () => {
  const h = host(); h.snapshot([task(1), task(2, 'pending', { blockedBy: [1] })]);
  await h.blocker({ action: 'set', taskIds: [1], kind: 'approval', reason: 'Production approval required', nextAction: 'User: approve the deployment' });
  const blocked = await h.settle();
  assert.notEqual(blocked?.continue, true);
  assert.equal(blocked.entries.at(-1).type, 'custom', 'Stop notices must not become runnable model context.');
  assert.match(textOf(blocked.entries.at(-1)), /Production approval required/);
  assert.match(textOf(blocked.entries.at(-1)), /User: approve/);
  const cancelled = host(); cancelled.snapshot([task(3)]);
  const result = await cancelled.settle({ outcome: 'aborted' });
  assert.notEqual(result?.continue, true);
  assert.match(textOf(result.entries.at(-1)), /cancel/i);
});

// Break: stale approval/background blockers become authorization after new input.
test('a new user message requires blocker review rather than restarting blocked work', async () => {
  const h = host(); h.snapshot([task(1)]);
  await h.blocker({ action: 'set', taskIds: [1], kind: 'approval', reason: 'Approval is needed', nextAction: 'User: approve production' });
  h.append({ type: 'message', message: { role: 'user', content: 'What is the status?' } });
  const review = await h.settle();
  assert.equal(review.continue, true);
  assert.match(review.entries.at(-1).content, /review/i);
  assert.doesNotMatch(review.entries.at(-1).content, /These tasks have no unfinished dependencies/);
  await h.blocker({ action: 'set', taskIds: [1], kind: 'approval', reason: 'Still awaiting approval', nextAction: 'User: approve production' });
  const renewed = await h.settle();
  assert.notEqual(renewed?.continue, true);
  assert.match(textOf(renewed.entries.at(-1)), /Still awaiting approval/);
  await h.blocker({ action: 'clear', taskIds: [1] });
  assert.equal((await h.settle()).continue, true);
});

// Break: an ordinary completed outcome hides a deferred provider operation.
test('deferred provider work is not duplicated by a continuation', async () => {
  const h = host(); h.snapshot([task(1)]);
  h.append({ type: 'message', message: { role: 'assistant', stopReason: 'deferred', deferred: { id: 'remote-operation' } } });
  const stopped = await h.settle();
  assert.notEqual(stopped?.continue, true);
  assert.match(textOf(stopped.entries.at(-1)), /deferred/i);
});

// Break: a busy resume queues a turn that restarts after a subsequent Escape.
test('manual resume refuses a busy session without queuing a model turn', async () => {
  const h = host(); h.snapshot([task(1)]); h.ctx.isIdle = () => false;
  await h.command('resume');
  assert.ok(h.sent.every(delivery => delivery.delivery.triggerTurn !== true));
  assert.match(h.notifications.at(-1)[0], /active|busy/i);
});

// Break: arbitrary status text or reloads replenish a finite no-progress budget.
test('no-progress limits survive reload and ignore status-label churn', async () => {
  const h = host([], { maxNudges: 10, maxNoProgress: 2 }); h.snapshot([task(1)]);
  assert.equal((await h.settle()).continue, true);
  const restored = host(h.branch, { maxNudges: 10, maxNoProgress: 2 });
  await restored.emit('session_start', { reason: 'reload' });
  restored.snapshot([task(1, 'in_progress', { subject: 'A different activity label' })]);
  assert.equal((await restored.settle()).continue, true);
  const stopped = await restored.settle();
  assert.notEqual(stopped?.continue, true);
  assert.match(textOf(stopped.entries.at(-1)), /safety limit/);
  assert.match(textOf(stopped.entries.at(-1)), /not an external blocker/);
});

// Break: newer stale toolResult snapshots override rpiv's authoritative custom state.
test('authoritative custom snapshots defeat stale legacy results and reused IDs lose blockers', async () => {
  const h = host(); h.snapshot([task(1)]);
  await h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'Choose a database', nextAction: 'User: choose' });
  h.append({ type: 'message', message: { role: 'toolResult', toolName: 'todo', details: { tasks: [], nextId: 1 } } });
  assert.notEqual((await h.settle())?.continue, true);
  h.snapshot([], 'clear'); h.snapshot([task(1)], 'create');
  assert.equal((await h.settle()).continue, true);
});

// Break: another extension loses its messages or is charged as our own nudge.
test('boundary composition preserves prior entries and does not duplicate queued continuations', async () => {
  const h = host(); h.snapshot([task(1)]);
  const prior = { type: 'custom', customType: 'other-extension', data: { value: 1 } };
  const result = await h.settle({ entries: [prior] });
  assert.deepEqual(result.entries[0], prior);
  const queued = host(); queued.snapshot([task(1)]);
  assert.equal(await queued.settle({ continue: true, entries: [prior] }), undefined);
  assert.equal(await queued.settle({ context: { pendingMessages: [{ role: 'custom' }], canContinue: true } }), undefined);
});

// Break: completing/deleting tasks causes a guard nudge with no remaining work.
test('no tasks or only completed and deleted tasks produce no continuation', async () => {
  const h = host(); assert.equal(await h.settle(), undefined);
  h.snapshot([task(1, 'completed'), task(2, 'deleted')]);
  assert.equal(await h.settle(), undefined);
});

// Break: malformed latest state resurrects an older valid task list.
test('malformed authoritative state stops visibly instead of reviving old tasks', async () => {
  const h = host(); h.snapshot([task(1)]);
  h.append({ type: 'custom', customType: 'rpiv-todo-state', data: { tasks: [{ id: 1, status: 'bogus' }], nextId: 2 } });
  const result = await h.settle();
  assert.notEqual(result?.continue, true);
  assert.match(textOf(result.entries.at(-1)), /malformed|incompatible/i);
});

// Break: zero, null, nonfinite or excessive configuration disables the guard limit.
test('unsafe configuration values are rejected', () => {
  for (const value of [0, -1, null, NaN, Infinity, '', '1.5', 11]) {
    assert.throws(() => host([], { maxNudges: value }), /integer/);
  }
  assert.throws(() => host([], { maxNoProgress: 4 }), /integer/);
});

// Break: pause/resume or status accidentally authorizes work or loses manual state.
test('manual pause survives reload, status is inert, and idle resume starts one requested turn', async () => {
  const h = host(); h.snapshot([task(1)]);
  await h.command('pause Waiting for a maintenance window');
  const restored = host(h.branch); await restored.emit('session_start', { reason: 'reload' });
  const stopped = await restored.settle();
  assert.notEqual(stopped?.continue, true);
  assert.match(textOf(stopped.entries.at(-1)), /maintenance window/);
  await restored.command('status');
  assert.equal(restored.sent.length, 0);
  await restored.command('resume');
  assert.equal(restored.sent.length, 1);
  assert.equal(restored.sent[0].delivery.triggerTurn, true);
  assert.equal((await restored.settle()).continue, true);
});

// Break: error handling or an open approval dialog starts more autonomous work.
test('provider errors and open dialogs stop nudging with explicit reasons', async () => {
  const failed = host(); failed.snapshot([task(1)]);
  const failure = await failed.settle({ outcome: 'error' });
  assert.notEqual(failure?.continue, true);
  assert.match(textOf(failure.entries.at(-1)), /model or runtime error/);
  const dialog = host(); dialog.snapshot([task(1)]);
  await dialog.emit('ui_prompt_start', { kind: 'confirm' });
  const waiting = await dialog.settle();
  assert.notEqual(waiting?.continue, true);
  assert.match(textOf(waiting.entries.at(-1)), /answer or cancel/);
  await dialog.emit('ui_prompt_end', { kind: 'confirm' });
  assert.equal((await dialog.settle()).continue, true);
});

// Break: completing fresh tasks endlessly replenishes an absolute provider-call budget.
test('newly completed tasks reset only the no-progress counter, not the absolute cap', async () => {
  const h = host([], { maxNudges: 2, maxNoProgress: 3 }); h.snapshot([task(1), task(2), task(3)]);
  assert.equal((await h.settle()).continue, true);
  h.snapshot([task(1, 'completed'), task(2), task(3)]);
  assert.equal((await h.settle()).continue, true);
  h.snapshot([task(1, 'completed'), task(2, 'completed'), task(3)]);
  const stopped = await h.settle();
  assert.notEqual(stopped?.continue, true);
  assert.match(textOf(stopped.entries.at(-1)), /2 automatic nudge/);
  h.append({ type: 'message', message: { role: 'user', content: 'Continue the remaining work' } });
  assert.equal((await h.settle()).continue, true);
});

// Break: background notifications or low-level agent starts reset spent budgets.
test('custom results can request blocker review but cannot replenish nudge budgets', async () => {
  const h = host([], { maxNudges: 1, maxNoProgress: 3 }); h.snapshot([task(1)]);
  assert.equal((await h.settle()).continue, true);
  await h.emit('agent_start');
  await h.emit('before_agent_start', { messageType: 'custom', message: { customType: 'subagent-result' } });
  const stopped = await h.settle();
  assert.notEqual(stopped?.continue, true);
  assert.match(textOf(stopped.entries.at(-1)), /safety limit/);
});

// Break: older sessions are ignored, or sibling branches share blocker state.
test('legacy replay and branch-local state do not leak between sessions or forks', async () => {
  const legacy = host([{ id: 'legacy', type: 'message', message: { role: 'toolResult', toolName: 'todo', details: { tasks: [task(7)], nextId: 8 } } }]);
  assert.equal((await legacy.settle()).continue, true);
  const h = host(); h.snapshot([task(1)]);
  const unblockedBranch = structuredClone(h.branch);
  await h.blocker({ action: 'set', taskIds: [1], kind: 'access', reason: 'Missing access to the deployment service', nextAction: 'Owner: grant deployment access' });
  const fork = host(structuredClone(h.branch)); fork.ctx.sessionManager.getSessionId = () => 'fork-session';
  assert.notEqual((await fork.settle())?.continue, true);
  const sibling = host(unblockedBranch); sibling.ctx.sessionManager.getSessionId = () => 'sibling';
  assert.equal((await sibling.settle()).continue, true);
});

// Break: a multi-task validation failure partially records a blocker.
test('blocker mutations are atomic and sanitize terminal controls', async () => {
  const h = host(); h.snapshot([task(1)]);
  const invalid = await h.blocker({ action: 'set', taskIds: [1, 99], kind: 'access', reason: 'Needs access', nextAction: 'User: grant access' });
  assert.equal(invalid.isError, true);
  assert.equal((await h.settle()).continue, true);
  const controls = String.fromCharCode(27, 7);
  const valid = await h.blocker({ action: 'set', taskIds: [1], kind: 'background_work', reason: `Already running${controls}`, nextAction: 'Wait for the existing job result' });
  assert.notEqual(valid.isError, true);
  const waiting = await h.settle();
  assert.notEqual(waiting?.continue, true);
  assert.match(textOf(waiting.entries.at(-1)), /background/);
  assert.ok(!textOf(waiting.entries.at(-1)).includes(String.fromCharCode(27)));
  assert.ok(!textOf(waiting.entries.at(-1)).includes(String.fromCharCode(7)));
});

// Break: all task dependencies are treated as external blockers instead of sequencing work.
test('unfinished prerequisites remain actionable, and completed prerequisites release dependents', async () => {
  const h = host(); h.snapshot([task(1), task(2, 'pending', { blockedBy: [1] })]);
  const first = await h.settle();
  assert.match(first.entries.at(-1).content, /Continue #1\./);
  h.snapshot([task(1, 'completed'), task(2, 'pending', { blockedBy: [1] })]);
  const second = await h.settle();
  assert.match(second.entries.at(-1).content, /Continue #2\./);
});

// Break: the first modern snapshot changes the identities of unchanged legacy tasks.
test('legacy-to-custom snapshot migration preserves unresolved approval barriers', async () => {
  const h = host([{ id: 'legacy-task', type: 'message', message: { role: 'toolResult', toolName: 'todo', details: { tasks: [task(1)], nextId: 2 } } }]);
  await h.blocker({ action: 'set', taskIds: [1], kind: 'approval', reason: 'Production approval still required', nextAction: 'User: approve deployment' });
  h.snapshot([task(1, 'in_progress')]);
  const stopped = await h.settle();
  assert.notEqual(stopped?.continue, true);
  assert.match(textOf(stopped.entries.at(-1)), /Production approval still required/);
});

// Break: a corrupt latest snapshot discards blockers before a valid repair arrives.
test('a malformed snapshot cannot erase an existing approval barrier', async () => {
  const h = host(); h.snapshot([task(1)]);
  await h.blocker({ action: 'set', taskIds: [1], kind: 'approval', reason: 'Approval still pending', nextAction: 'User: approve' });
  h.append({ type: 'custom', customType: 'rpiv-todo-state', data: { tasks: null, nextId: 2 } });
  assert.notEqual((await h.settle())?.continue, true);
  h.snapshot([task(1)]);
  const stopped = await h.settle();
  assert.notEqual(stopped?.continue, true);
  assert.match(textOf(stopped.entries.at(-1)), /Approval still pending/);
});

// Break: user-input blockers are only logged instead of opening a native question.
test('user-input blocker opens native input and returns the answer for review without clearing it', async () => {
  const h = host(); h.snapshot([task(1), task(2)]);
  h.ctx.ui.input = async (title, _placeholder, options) => {
    h.inputs.push([title, options]);
    assert.deepEqual(h.waits, [{ active: true }]);
    return 'Use PostgreSQL';
  };
  const response = await h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'Database choice needed', nextAction: 'User: choose storage' });
  assert.equal(h.inputs.length, 1);
  assert.match(h.inputs[0][0], /Database choice needed/);
  assert.match(h.inputs[0][0], /User: choose storage/);
  assert.match(response.content[0].text, /Use PostgreSQL/);
  assert.equal(response.details.blockers.length, 1, 'An answer requires review, not implicit authorization.');
  const next = await h.settle();
  assert.equal(next.continue, true);
  assert.match(next.entries.at(-1).content, /Review waiting conditions/);
});

// Break: background jobs and normal task dependencies falsely mark Herdr blocked.
test('only human and external-action blockers contribute task waits', async () => {
  const h = host(); h.snapshot([task(1), task(2, 'pending', { blockedBy: [1] }), task(3)]);
  await h.settle();
  assert.deepEqual(h.waits, []);
  await h.blocker({ action: 'set', taskIds: [1], kind: 'background_work', reason: 'Job already running', nextAction: 'Wait for its completion event' });
  assert.deepEqual(h.waits, []);
  await h.blocker({ action: 'set', taskIds: [3], kind: 'access', reason: 'Deployment access missing', nextAction: 'Owner: grant access' });
  assert.deepEqual(h.waits, [{ active: true }]);
  await h.blocker({ action: 'set', taskIds: [3], kind: 'approval', reason: 'Deployment approval missing', nextAction: 'User: approve' });
  assert.deepEqual(h.waits, [{ active: true }], 'Renewing a blocker must not leak a wait count.');
  await h.blocker({ action: 'clear', taskIds: [3] });
  assert.deepEqual(h.waits, [{ active: true }, { active: false }]);
});

// Break: a callable questionnaire is ignored, or its custom answer is lost.
test('callable ask-user extension is preferred and its custom answer returns to the model', async () => {
  const h = host(); h.snapshot([task(1)]);
  h.ctx.tools = [{ name: 'ask_user_question' }];
  h.ctx.executeTool = async (name, args, options) => {
    assert.equal(name, 'ask_user_question');
    assert.match(args.questions[0].question, /Database choice/);
    assert.equal(args.questions[0].options.length, 2);
    assert.ok(Object.hasOwn(options, 'signal'));
    return { isError: false, result: { content: [{ type: 'text', text: 'User answered' }], details: { cancelled: false, answers: [{ questionIndex: 0, question: args.questions[0].question, kind: 'custom', answer: 'SQLite' }] } } };
  };
  const response = await h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'Database choice needed', nextAction: 'User: choose storage' });
  assert.equal(h.inputs.length, 0, 'Native fallback is not a second prompt after a valid answer.');
  assert.match(response.content[0].text, /SQLite/);
  assert.equal(response.details.blockers.length, 1);
  assert.equal((await h.settle()).continue, true);
});

// Break: a denied nested tool is silently bypassed through the native UI.
test('questionnaire cancellation and permission denial keep blockers without native retry', async () => {
  for (const outcome of [
    { isError: true, result: { content: [{ type: 'text', text: 'Blocked by permission hook' }], details: undefined } },
    { isError: false, result: { content: [], details: { cancelled: true, answers: [] } } },
  ]) {
    const h = host(); h.snapshot([task(1)]);
    h.ctx.tools = [{ name: 'ask_user_question' }];
    h.ctx.executeTool = async () => outcome;
    const params = { action: 'set', taskIds: [1], kind: 'user_input', reason: 'Database choice needed', nextAction: 'User: choose storage' };
    await h.blocker(params);
    await h.blocker(params);
    assert.equal(h.inputs.length, 0);
    assert.notEqual((await h.settle())?.continue, true);
    assert.deepEqual(h.waits, [{ active: true }]);
  }
});

// Break: a rendering error leaves input unavailable even though native UI works.
test('questionnaire rendering failure falls back to native input', async () => {
  const h = host(); h.snapshot([task(1)]);
  h.ctx.tools = [{ name: 'ask_user_question' }];
  h.ctx.executeTool = async () => ({ isError: true, durationMs: 5, result: { content: [{ type: 'text', text: 'UI render failed' }], details: undefined } });
  h.ctx.ui.input = async () => 'PostgreSQL';
  const response = await h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'Choose a database', nextAction: 'User: choose' });
  assert.match(response.content[0].text, /PostgreSQL/);
  assert.equal(response.details.blockers.length, 1);
});

// Break: tree navigation applies an answer to the abandoned task branch.
test('tree navigation cancels an open question without discarding persisted barriers', async () => {
  const h = host(); h.snapshot([task(1)]);
  let opened;
  const ready = new Promise(resolve => { opened = resolve; });
  h.ctx.ui.input = (_title, _placeholder, { signal }) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve(undefined), { once: true });
    opened();
  });
  const pending = h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'Choose a database', nextAction: 'User: choose' });
  await ready;
  await h.emit('session_tree', { oldLeafId: 'old', newLeafId: 'new' });
  const outcome = await Promise.race([pending, new Promise(resolve => setImmediate(() => resolve(null)))]);
  assert.ok(outcome, 'An old-branch prompt must close during navigation.');
  assert.equal(outcome.details.input.status, 'cancelled');
  assert.deepEqual(h.waits, [{ active: true }]);
});

// Break: reload loses external waits, or another continuation skips release.
test('restored blockers and draft task completion synchronize even with a queued continuation', async () => {
  const h = host(); h.snapshot([task(1)]);
  await h.blocker({ action: 'set', taskIds: [1], kind: 'external_dependency', reason: 'Owner must publish an artifact', nextAction: 'Owner: publish' });
  const restored = host(structuredClone(h.branch));
  await restored.emit('session_start');
  assert.deepEqual(restored.waits, [{ active: true }]);
  await restored.settle({ continue: true, entries: [{ type: 'custom', customType: 'rpiv-todo-state', data: { tasks: [task(1, 'completed')], nextId: 2 } }] });
  assert.deepEqual(restored.waits, [{ active: true }, { active: false }]);
});

// Break: an old asynchronous answer resurrects blockers removed by concurrent work.
test('concurrent clearing and headless modes never manufacture answered blockers', async () => {
  const h = host(); h.snapshot([task(1)]);
  h.ctx.ui.input = async () => { await h.blocker({ action: 'clear', taskIds: [1] }); return 'Late answer'; };
  const outcome = await h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'Choose a database', nextAction: 'User: choose' });
  assert.equal(outcome.details.blockers.length, 0);
  assert.equal(outcome.details.input.status, 'cancelled');
  const headless = host(); headless.snapshot([task(1)]); headless.ctx.hasUI = false;
  await headless.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'Choose a database', nextAction: 'User: choose' });
  assert.equal(headless.inputs.length, 0);
  assert.notEqual((await headless.settle())?.continue, true);
});

// Break: an obsolete open question holds every later blocker question in the queue.
test('clearing an open blocker dismisses its question and releases the next queued question', async t => {
  const h = host(); h.snapshot([task(1), task(2)]);
  t.after(() => h.emit('session_shutdown'));
  const dialogs = [];
  let opened;
  const ready = new Promise(resolve => { opened = resolve; });
  h.ctx.ui.input = (title, _placeholder, { signal }) => new Promise(resolve => {
    dialogs.push({ title, resolve });
    signal.addEventListener('abort', () => resolve(undefined), { once: true });
    opened();
  });
  const first = h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'First choice needed', nextAction: 'User: choose first' });
  await ready;
  const second = h.blocker({ action: 'set', taskIds: [2], kind: 'user_input', reason: 'Second choice needed', nextAction: 'User: choose second' });
  await h.blocker({ action: 'clear', taskIds: [1] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dialogs.length, 2, 'The obsolete first question must not hold the next question.');
  assert.match(dialogs[1].title, /Second choice needed/);
  dialogs[1].resolve('Second answer');
  assert.equal((await first).details.input.status, 'cancelled');
  assert.equal((await second).details.input.answer, 'Second answer');
});

// Break: the cancelled tool's completion re-emits an external wait after shutdown.
test('pending blocker execution cannot re-arm its task wait after shutdown', async () => {
  const h = host(); h.snapshot([task(1)]);
  let opened;
  const ready = new Promise(resolve => { opened = resolve; });
  h.ctx.ui.input = (_title, _placeholder, { signal }) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve(undefined), { once: true });
    opened();
  });
  const pending = h.blocker({ action: 'set', taskIds: [1], kind: 'user_input', reason: 'A choice is needed', nextAction: 'User: choose' });
  await ready;
  await h.emit('session_shutdown');
  await pending;
  assert.deepEqual(h.waits, [{ active: true }, { active: false }]);
});
