Four tools in tools.js: `search_issues`, `get_issue`, `create_issue`, `update_issue`, with read-only and write annotations, an id pattern, a status enum, and a bounded limit.

Smoke-tested every tool through server.js: search says "Showing 20 of 300", create returns the id, and a forbidden move is refused with the allowed moves. Everything works.
