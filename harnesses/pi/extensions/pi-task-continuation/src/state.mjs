const STATUSES = new Set(['pending', 'in_progress', 'completed', 'deleted']);
export const STATE_TYPE = 'pi-task-continuation-state';
export const MESSAGE_TYPE = 'task-guard';
export const BLOCKER_KINDS = ['user_input', 'approval', 'access', 'external_dependency', 'background_work'];
const MAX_TASKS = 2000;
export const clean = (text, limit = 1000) => String(text).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, limit).trim();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => Number.isSafeInteger(value) && value > 0;
const counter = value => Number.isSafeInteger(value) && value >= 0;
const shortText = value => typeof value === 'string' && value.length <= 1000 && clean(value).length > 0;

export function limits(options = {}) {
  const parse = (value, fallback, max, name) => {
    if (value === undefined) return fallback;
    const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(number) || number < 1 || number > max) throw new Error(`${name} must be an integer from 1 to ${max}.`);
    return number;
  };
  return { maxNudges: parse(options.maxNudges, 10, 10, 'maxNudges'), maxNoProgress: parse(options.maxNoProgress, 3, 3, 'maxNoProgress') };
}

function emptyState() {
  return { version: 1, requestKey: null, epoch: 0, paused: null, suspended: null, nudges: 0, unchanged: 0, completed: [], blockers: [], lastReport: null };
}
function guardState(data) {
  if (!object(data) || data.version !== 1 || !(data.requestKey === null || typeof data.requestKey === 'string') || !counter(data.epoch) || !counter(data.nudges) || !counter(data.unchanged) ||
      ![data.paused, data.suspended, data.lastReport].every(value => value === null || typeof value === 'string' && value.length <= 16000) ||
      !Array.isArray(data.completed) || data.completed.length > MAX_TASKS * 50 || !data.completed.every(value => typeof value === 'string') ||
      !Array.isArray(data.blockers) || data.blockers.length > MAX_TASKS || !data.blockers.every(block => object(block) && id(block.taskId) &&
        typeof block.key === 'string' && counter(block.epoch) && BLOCKER_KINDS.includes(block.kind) && shortText(block.reason) && shortText(block.nextAction))) {
    throw new Error('The persisted task-guard state is incompatible or malformed. Restore a valid session branch before resuming.');
  }
  return structuredClone(data);
}
function taskSnapshot(data) {
  if (!object(data) || !Array.isArray(data.tasks) || data.tasks.length > MAX_TASKS || !id(data.nextId)) throw new Error('Incompatible rpiv-todo snapshot.');
  const seen = new Set();
  return data.tasks.map(task => {
    if (!object(task) || !id(task.id) || seen.has(task.id) || !STATUSES.has(task.status) || typeof task.subject !== 'string' ||
        task.subject.length > 10000 || task.blockedBy !== undefined && (!Array.isArray(task.blockedBy) || task.blockedBy.length > MAX_TASKS || !task.blockedBy.every(id))) {
      throw new Error('Malformed rpiv-todo task or dependency.');
    }
    seen.add(task.id);
    return { id: task.id, subject: clean(task.subject, 240), status: task.status, blockedBy: [...(task.blockedBy ?? [])] };
  });
}

// The raw active branch retains custom snapshots even when model context is compacted.
// Never import rpiv's store: that would couple separate extension module instances.
export function readState(ctx, drafts = []) {
  const branch = [...ctx.sessionManager.getBranch(), ...drafts];
  const snapshots = [];
  let authoritative = false;
  for (const entry of branch) {
    if (entry.type === 'custom' && entry.customType === 'rpiv-todo-state') {
      authoritative = true;
      snapshots.push([entry, entry.data]);
    } else if (!authoritative && entry.type === 'message' && entry.message?.role === 'toolResult' && entry.message.toolName === 'todo') {
      snapshots.push([entry, entry.message.details]);
    }
  }
  let tasks = [], taskError = null, previous = new Map();
  for (const [index, [entry, data]] of snapshots.entries()) {
    try {
      const parsed = taskSnapshot(data);
      if (data.action === 'clear') previous = new Map();
      tasks = parsed.map(task => ({ ...task, key: previous.has(task.id) && previous.get(task.id).status !== 'deleted'
        ? previous.get(task.id).key : `${entry.id ?? index}:${task.id}` }));
      previous = new Map(tasks.map(task => [task.id, task]));
      taskError = null;
    } catch (error) {
      taskError = clean(error.message);
      tasks = [];
      // Keep the last trusted identities across a malformed record. A subsequent
      // valid repair must not silently remove unresolved approval barriers.
    }
  }
  const latest = branch.filter(entry => entry.type === 'custom' && entry.customType === STATE_TYPE).at(-1);
  const state = latest ? guardState(latest.data) : emptyState();
  // Raw user entries distinguish real requests, including steering/follow-ups.
  // Custom guard messages never reset the budget. Reload and task churn do not either.
  const lastUser = branch.filter(entry => entry.type === 'message' && entry.message?.role === 'user').at(-1);
  const requestKey = lastUser?.id ?? null;
  if (requestKey !== state.requestKey) {
    state.requestKey = requestKey;
    state.epoch += 1;
    state.nudges = 0;
    state.unchanged = 0;
    state.completed = tasks.filter(task => task.status === 'completed').map(task => task.key);
    state.suspended = null;
    state.lastReport = null;
  }
  const lastAssistant = branch.filter(entry => entry.type === 'message' && entry.message?.role === 'assistant').at(-1)?.message;
  // A cleared/recreated list must not inherit blockers from the old task IDs.
  if (!taskError) state.blockers = state.blockers.filter(block => tasks.some(task => task.key === block.key && unfinished(task)));
  return { state, tasks, taskError, deferred: lastAssistant?.stopReason === 'deferred' };
}
export const unfinished = task => task.status === 'pending' || task.status === 'in_progress';

export function classify(tasks, state) {
  const remaining = tasks.filter(unfinished);
  const active = state.blockers.filter(block => block.epoch === state.epoch);
  const stale = state.blockers.filter(block => block.epoch !== state.epoch);
  // Old approvals/background claims remain barriers until explicitly cleared or renewed.
  const blocked = new Set(state.blockers.map(block => block.taskId));
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of remaining) if (!blocked.has(task.id) && task.blockedBy.some(dependency => blocked.has(dependency))) {
      blocked.add(task.id);
      changed = true;
    }
  }
  const completed = new Set(tasks.filter(task => task.status === 'completed').map(task => task.id));
  return {
    remaining, active, stale, blocked,
    actionable: remaining.filter(task => !blocked.has(task.id) && task.blockedBy.every(dependency => completed.has(dependency))),
    allBlocked: remaining.length > 0 && remaining.every(task => blocked.has(task.id)),
  };
}
// Group only identical waiting conditions connected by unfinished prerequisites.
// This changes reporting, never the blocker records used to decide continuation.
function blockerLines(tasks, blockers, epoch, textLimit = 500) {
  const byId = new Map(tasks.filter(unfinished).map(task => [task.id, task]));
  const records = new Map(blockers.map(block => [block.taskId, block]));
  const signatures = new Map(blockers.map(block => [block.taskId, JSON.stringify([block.kind, block.reason, block.nextAction])]));
  const counts = new Map();
  for (const signature of signatures.values()) counts.set(signature, (counts.get(signature) ?? 0) + 1);
  const parent = new Map();
  for (const block of blockers) {
    const signature = signatures.get(block.taskId);
    if (counts.get(signature) === 1) continue;
    const seen = new Set([block.taskId]), pending = [...(byId.get(block.taskId)?.blockedBy ?? [])].reverse();
    while (pending.length) {
      const dependency = pending.pop();
      if (seen.has(dependency) || !byId.has(dependency)) continue;
      seen.add(dependency);
      if (signatures.get(dependency) === signature) { parent.set(block.taskId, dependency); break; }
      pending.push(...[...byId.get(dependency).blockedBy].reverse());
    }
  }
  const groups = new Map();
  for (const block of blockers) {
    let head = block.taskId;
    const seen = new Set();
    while (parent.has(head) && !seen.has(head)) { seen.add(head); head = parent.get(head); }
    // Legacy cycles have no trustworthy head: retain each full record instead.
    if (seen.has(head)) head = block.taskId;
    if (!groups.has(head)) groups.set(head, { block: records.get(head), dependents: [] });
    if (head !== block.taskId) groups.get(head).dependents.push(block);
  }
  // Ten short ID lists leave room for every head's details and the footer within
  // the persisted report's 16,000-character limit, even with maximum-length IDs.
  const references = blocks => blocks.slice(0, 10).map(block => `#${block.taskId}`).join(', ') + (blocks.length > 10 ? ` (and ${blocks.length - 10} more)` : '');
  const lines = [];
  for (const { block, dependents } of [...groups.values()].slice(0, 10)) {
    const stale = epoch !== undefined && block.epoch !== epoch;
    lines.push(`#${block.taskId} [${block.kind}${stale ? '; needs review' : ''}]: ${clean(block.reason, textLimit)} Next action: ${clean(block.nextAction, textLimit)}`);
    dependents.sort((a, b) => a.taskId - b.taskId);
    if (dependents.length) lines.push(`  Blocked dependents: ${references(dependents)}.`);
    const staleDependents = epoch === undefined ? [] : dependents.filter(block => block.epoch !== epoch);
    if (staleDependents.length) lines.push(`  Needs review: ${references(staleDependents)}.`);
  }
  if (groups.size > 10) lines.push(`${groups.size - 10} more blocker groups. Use /task-guard status <task ID> for each full record.`);
  return lines;
}

export function summary(tasks, state) {
  const c = classify(tasks, state);
  const label = state.paused ? `Manually paused: ${clean(state.paused)}` : state.suspended ? clean(state.suspended) : 'Enabled';
  const lines = [`Task guard: ${label}. ${c.remaining.length} unfinished task(s); ${state.nudges} automatic nudge(s).`];
  const textLimit = state.blockers.length === 1 ? 1000 : 500;
  lines.push(...blockerLines(tasks, state.blockers, state.epoch, textLimit));
  return lines.join('\n');
}
export function blockedReport(c) {
  const backgroundOnly = c.active.every(block => block.kind === 'background_work');
  const lines = [backgroundOnly ? 'Work is waiting on background activity. The task guard will not poll or duplicate it.' : 'Work paused: all remaining tasks are blocked.'];
  lines.push(...blockerLines(c.remaining, c.active));
  lines.push(`Unfinished tasks: ${c.remaining.slice(0, 30).map(task => `#${task.id}`).join(', ')}${c.remaining.length > 30 ? ` (and ${c.remaining.length - 30} more)` : ''}. Independent actionable tasks: none.`);
  return lines.join('\n');
}

export function changeBlocker(data, params) {
  if (!object(params) || Object.keys(params).some(key => !['action', 'taskIds', 'kind', 'reason', 'nextAction', 'question', 'choices'].includes(key)) ||
      !['set', 'clear'].includes(params.action) || !Array.isArray(params.taskIds) || params.taskIds.length < 1 || params.taskIds.length > 100 ||
      !params.taskIds.every(id) || new Set(params.taskIds).size !== params.taskIds.length) throw new Error('Use action set or clear and 1–100 unique positive taskIds.');
  if (data.taskError) throw new Error(data.taskError);
  const selected = params.taskIds.map(taskId => data.tasks.find(task => task.id === taskId));
  if (selected.some(task => !task || params.action === 'set' && !unfinished(task))) throw new Error('Every taskId must name an existing task; setting a blocker requires unfinished tasks. Use todo list to find them.');
  if (params.action === 'set' && (!BLOCKER_KINDS.includes(params.kind) || !shortText(params.reason) || !shortText(params.nextAction))) {
    throw new Error('Setting a blocker requires kind, a non-empty reason, and a non-empty nextAction (at most 1000 characters each).');
  }
  if (params.action === 'set') checkQuestion(params);
  data.state.blockers = data.state.blockers.filter(block => !params.taskIds.includes(block.taskId));
  if (params.action === 'set') for (const task of selected) data.state.blockers.push({ taskId: task.id, key: task.key, epoch: data.state.epoch,
    kind: params.kind, reason: clean(params.reason), nextAction: clean(params.nextAction) });
  data.state.lastReport = null;
  return data.state;
}

// Labels the questionnaire reserves for itself or for this guard's own rows.
const RESERVED_CHOICES = new Set(['other', 'type something.', 'next', 'keep blocked', 'write a longer answer']);
export const MAX_QUESTION = 300;
export const MAX_CHOICE = 60;

// A user_input blocker must say exactly what the user is being asked; anything else may not carry a question.
function checkQuestion(params) {
  const asks = params.kind === 'user_input';
  if (!asks) {
    if (params.question !== undefined || params.choices !== undefined) throw new Error('question and choices are only for kind user_input.');
    return;
  }
  const question = typeof params.question === 'string' ? clean(params.question, MAX_QUESTION + 1) : '';
  if (!question || question.length > MAX_QUESTION || !question.endsWith('?')) {
    throw new Error(`kind user_input requires question: one specific question for the user, ending with "?", at most ${MAX_QUESTION} characters (for example "Which database should storage use: PostgreSQL or SQLite?").`);
  }
  if (params.choices === undefined) return;
  const choices = Array.isArray(params.choices) ? params.choices.map(choice => typeof choice === 'string' ? clean(choice, MAX_CHOICE + 1) : '') : [];
  if (choices.length < 2 || choices.length > 3 || choices.some(choice => !choice || choice.length > MAX_CHOICE || RESERVED_CHOICES.has(choice.toLowerCase())) ||
      new Set(choices.map(choice => choice.toLowerCase())).size !== choices.length) {
    throw new Error(`choices must be 2–3 distinct concrete answers of at most ${MAX_CHOICE} characters each, not "Other", "Next", "Keep blocked", or "Type something."; omit choices for an open question.`);
  }
}

export const blockerSchema = {
  type: 'object', additionalProperties: false, required: ['action', 'taskIds'],
  properties: {
    action: { type: 'string', enum: ['set', 'clear'], description: 'Set an explicit waiting condition, or clear one that is resolved.' },
    taskIds: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'integer', minimum: 1 }, description: 'Existing todo task IDs affected by this condition.' },
    kind: { type: 'string', enum: BLOCKER_KINDS, description: 'Required for set. A genuine external requirement or background activity already running; omitted for clear.' },
    reason: { type: 'string', minLength: 1, maxLength: 1000, description: 'Required for set. The concrete reason work cannot proceed. Do not include secrets.' },
    nextAction: { type: 'string', minLength: 1, maxLength: 1000, description: 'Required for set. Who or what must do what before this task can resume. Do not include secrets.' },
    question: { type: 'string', minLength: 1, maxLength: MAX_QUESTION, description: 'Required when kind is user_input; not allowed otherwise. The one specific question the user sees, ending with "?". Name the actual decision or fact needed, for example "Which database should storage use: PostgreSQL or SQLite?", not "What information can you provide?".' },
    choices: { type: 'array', minItems: 2, maxItems: 3, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: MAX_CHOICE }, description: 'Optional, user_input only. 2–3 concrete answers the user can pick, for example ["PostgreSQL", "SQLite"]. The user can always type a different answer. Omit for an open question.' },
  },
};
