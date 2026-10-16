// Tracker tools for the agent host (see registry.js for the shape).
const tracker = require('./tracker');

const ID = { type: 'string', pattern: '^TRK-\\d+$', description: 'Issue id, e.g. "TRK-42".' };
const STATUS = { type: 'string', enum: tracker.STATUSES };

const ok = (text, structuredContent) => ({ content: [{ type: 'text', text }], structuredContent });
const fail = (text) => ({ isError: true, content: [{ type: 'text', text }] });
const notFound = (id) => fail(`${id} not found; use search_issues to find the id.`);
const line = (i) => `${i.id} [${i.status}] ${i.title}${i.assignee ? ` (@${i.assignee})` : ''}`;

module.exports = [
  {
    name: 'search_issues',
    description: 'Search issues by text, status, or assignee. Returns id, title, status, assignee for one page. Does not include descriptions: use get_issue.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Text to match in title or description. Omitted: no text filter.' },
        status: { ...STATUS, description: 'Only issues in this status. Omitted: any status.' },
        assignee: { type: 'string', description: 'Only issues assigned to this username. Omitted: anyone.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20, description: 'Issues per page.' },
        offset: { type: 'integer', minimum: 0, default: 0, description: 'Matches to skip, for the next page.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    handler: ({ q, status, assignee, limit = 20, offset = 0 }) => {
      const { items, total } = tracker.search({ q, status, assignee, limit, offset });
      const head = items.length < total
        ? `Showing ${items.length} of ${total} (offset ${offset}); add status or assignee to narrow, or pass offset ${offset + items.length} for the next page.`
        : `${total} match(es).`;
      return ok([head, ...items.map(line)].join('\n'), { items, total, offset });
    },
  },
  {
    name: 'get_issue',
    description: 'Get one issue by id: id, title, description, status, assignee.',
    inputSchema: { type: 'object', properties: { id: ID }, required: ['id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    handler: ({ id }) => {
      const issue = tracker.get(id);
      return issue ? ok(`${line(issue)}\n\n${issue.description}`, issue) : notFound(id);
    },
  },
  {
    name: 'create_issue',
    description: 'Create an issue (status starts as open). Returns the new id.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1 },
        description: { type: 'string', description: 'Omitted: empty.' },
        assignee: { type: 'string', description: 'Username. Omitted: unassigned.' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: (args) => {
      const issue = tracker.create(args);
      return ok(`Created ${issue.id}: ${issue.title}`, issue);
    },
  },
  {
    name: 'update_issue',
    description: 'Change title, description, assignee, or status of an issue; omitted fields stay. Status moves follow the workflow (open -> in_progress -> in_review -> done; wontfix and reopen via open). Returns the updated issue.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID,
        title: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        assignee: { type: 'string' },
        status: STATUS,
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    handler: ({ id, ...patch }) => {
      const issue = tracker.get(id);
      if (!issue) return notFound(id);
      if (patch.status && !tracker.TRANSITIONS[issue.status].includes(patch.status)) {
        return fail(`Can't move ${id} ${issue.status} -> ${patch.status}; allowed from ${issue.status}: ${tracker.TRANSITIONS[issue.status].join(', ')}.`);
      }
      // Wired to the tracker's write path in the next change.
      return ok(`Updated ${line({ ...issue, ...patch })}`, { ...issue, ...patch });
    },
  },
];
