# Agent-facing tools

An interface whose caller is a model (MCP tools, function-calling schemas, a CLI an agent drives) is read, not learned: the caller sees only the name, the description, the schema, and each result. Write every one of those as the whole contract.

## Each tool

- **Description**: what it does, what it returns, what it doesn't do, and which sibling to use instead ("Returns key, title, status, assignee. Doesn't include the description or comments: use `get_issue`."). It states facts about the tool; behaviour rules for the model go in the server's instructions, if anywhere.
- **Schema**: tight. Enums for every closed set, `min`/`max` and a default on every limit, a pattern on ids, and a description on every parameter, including what an omitted optional means.
- **Reads and writes are separate tools.** Annotate each: `readOnlyHint: true` on every read; on writes `destructiveHint` (true when it overwrites or deletes) and `idempotentHint` (true when a retry with the same arguments is safe); `openWorldHint` when it reaches outside the system.

## Each result

- **Create returns the id** (and the URL), so the next call can refer to what it made. A mutation returns a short confirmation with the identifier, never a bare "ok".
- **Errors name the next step**: "PAY-99 not found; use `search_issues` to find the key", "can't move open → done; allowed from open: in_progress, wontfix". Return them as tool errors (`isError`), not exceptions that drop the connection.
- **A cut list says how much it cut**: "showing 20 of 3,412; add `project` or `status` to narrow", with the cursor for the next page.
- **Payload under the host's limit**: hosts cut tool results at roughly 25k tokens (Claude Code) to 150,000 characters (Claude Desktop). Cap your own well below it: return the fields the caller needs, truncate long text with its full length stated, and page or omit bulky parts (comments, history) behind a parameter or a sibling tool.
