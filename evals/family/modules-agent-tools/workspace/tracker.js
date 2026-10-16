// In-memory issue tracker. State lives in this module; every require() shares it.
// Issues: { id: 'TRK-<n>', title, description, status, assignee }.

const STATUSES = ['open', 'in_progress', 'in_review', 'done', 'wontfix'];

// Allowed moves from each status.
const TRANSITIONS = {
  open: ['in_progress', 'wontfix'],
  in_progress: ['in_review', 'open'],
  in_review: ['done', 'in_progress'],
  done: ['open'],
  wontfix: ['open'],
};

class TransitionError extends Error {
  constructor(id, from, to) {
    super(`Cannot move ${id} from ${from} to ${to}`);
    this.name = 'TransitionError';
    this.id = id;
    this.from = from;
    this.to = to;
    this.allowed = TRANSITIONS[from] ?? [];
  }
}

const issues = new Map();
let nextNumber = 1;

function create({ title, description = '', assignee = null }) {
  if (typeof title !== 'string' || !title.trim()) throw new Error('title is required');
  const issue = { id: `TRK-${nextNumber++}`, title: title.trim(), description, status: 'open', assignee };
  issues.set(issue.id, issue);
  return { ...issue };
}

function get(id) {
  const issue = issues.get(id);
  return issue ? { ...issue } : null;
}

// Matches q (case-insensitive) against title and description; status and assignee filter exactly.
// Returns { items, total }: items is one page (offset, limit), total counts every match.
function search({ q = '', status, assignee, limit = 50, offset = 0 } = {}) {
  const needle = q.toLowerCase();
  const matches = [...issues.values()].filter(
    (i) =>
      (!needle || i.title.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle)) &&
      (!status || i.status === status) &&
      (!assignee || i.assignee === assignee),
  );
  return { items: matches.slice(offset, offset + limit).map((i) => ({ ...i })), total: matches.length };
}

// patch: any of { title, description, assignee, status }. A status change must be an allowed move.
function update(id, patch) {
  const issue = issues.get(id);
  if (!issue) return null;
  if (patch.status !== undefined && patch.status !== issue.status) {
    if (!STATUSES.includes(patch.status) || !TRANSITIONS[issue.status].includes(patch.status)) {
      throw new TransitionError(id, issue.status, patch.status);
    }
  }
  for (const k of ['title', 'description', 'assignee', 'status']) if (patch[k] !== undefined) issue[k] = patch[k];
  return { ...issue };
}

// Seed data: 600 issues, half of them about checkout.
const areas = ['checkout', 'search', 'checkout', 'billing'];
const problems = ['times out', 'shows the wrong total', 'loses the cart', 'fails on Safari', 'is slow on mobile'];
const people = ['ana', 'bo', 'chen', 'dee', null];
for (let n = 0; n < 600; n++) {
  const issue = create({
    title: `${areas[n % 4]} ${problems[n % 5]}`,
    description: `Reported by support, ticket ${1000 + n}.`,
    assignee: people[n % 5],
  });
  issues.get(issue.id).status = STATUSES[n % 5];
}

module.exports = { STATUSES, TRANSITIONS, TransitionError, create, get, search, update };
