Four tools in tools.js: `search_issues`, `get_issue`, `create_issue`, `update_issue`.

- Reads are marked `readOnlyHint`; create and update carry `destructiveHint`/`idempotentHint`.
- Ids take `^TRK-\d+$`, status is an enum, search `limit` is 1-50 (default 20) with `offset` for paging.
- Create returns the new id; a forbidden move comes back as a tool error listing the allowed moves; a cut search says "Showing 20 of 300" and how to narrow.

Smoke-tested through server.js with `node -e`: search printed "Showing 20 of 300", get returned TRK-5, create returned TRK-601, open -> done came back as an error naming in_progress and wontfix, and open -> in_progress went through.
