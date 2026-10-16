// Tracker tools for the agent host (see registry.js for the shape).
const tracker = require('./tracker');

const json = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
const err = (m) => ({ isError: true, content: [{ type: 'text', text: m }] });

module.exports = [
  {
    name: 'search_issues',
    description: 'Search issues.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        status: { type: 'string', enum: tracker.STATUSES },
        assignee: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      },
    },
    handler: ({ q, status, assignee, limit = 25 }) => json(tracker.search({ q, status, assignee, limit })),
  },
  {
    name: 'get_issue',
    description: 'Get an issue by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: ({ id }) => tracker.get(id) ? json(tracker.get(id)) : err('Not found'),
  },
  {
    name: 'create_issue',
    description: 'Create an issue.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, description: { type: 'string' }, assignee: { type: 'string' } },
      required: ['title'],
    },
    handler: (args) => json(tracker.create(args)),
  },
  {
    name: 'update_issue',
    description: 'Update an issue.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        assignee: { type: 'string' },
        status: { type: 'string', enum: tracker.STATUSES },
      },
      required: ['id'],
    },
    handler: ({ id, ...patch }) => {
      try {
        const issue = tracker.update(id, patch);
        return issue ? json(issue) : err('Not found');
      } catch (e) {
        return err(e.message);
      }
    },
  },
];
