---
name: mcpx
description: Use when a shell script, Bash pipeline or one-off command needs this session's MCP tools (Atlassian, GitHub, Datadog and the rest) without a separate login, or when MCP results should be filtered with jq or node before they reach context.
---

# mcpx

`mcpx` calls the MCP tools of the running Claude Code session from Bash. The code-mode mod's bridge executes each request through `$.tool.call`, so the session's connections, permission prompts and hooks apply. No separate auth is needed. Only `mcp__*` tools are reachable; use direct tools for the rest.

```text
node ~/.claude/mcpx/mcpx.mjs status
node ~/.claude/mcpx/mcpx.mjs list jira
node ~/.claude/mcpx/mcpx.mjs call mcp__plugin_github_github__get_me
node ~/.claude/mcpx/mcpx.mjs call mcp__server__tool '{"key":"value"}'
echo '{"key":"value"}' | node ~/.claude/mcpx/mcpx.mjs call mcp__server__tool -
```

- Output is JSON. `call` prints the tool result (`text`, `result`, or `deny`/`isError`) and exits 1 on a denial or error.
- `list` shows names and descriptions, not input schemas. Look up unfamiliar schemas with `ToolSearch` first.
- Mutating tools still raise the session's permission prompt. A call waits up to 300 s (`--timeout`); a timeout does not prove the action did not run.
- `status` also lists saved recipes. Check it before writing a filter: `mcpx run <recipe> --set key=value` returns only the filtered answer. Repeated call shapes are saved as recipes automatically. See [RECIPES.md](RECIPES.md) for recipes, `--js` filters and how to manage them.
- If `status` shows no live session, the mod is not loaded; use direct tools.
