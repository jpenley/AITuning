# Runtime reference

Read the active tool declaration before each unfamiliar API. Tool names, schemas and return envelopes can differ between harnesses.

## Pi native code mode

Use Pi's native `codemode` tool. Its script globals include `tools`, discovery helpers and output functions such as `text()`. Call an underlying tool by the name and signature in its current declaration. Await the call and inspect its declared result type; do not assume Claude's envelope.

Discover MCP tools with the native discovery helpers advertised by the current runtime. Independent read calls may use `Promise.all` or `Promise.allSettled` when supported. Inspect every settled result. Await pagination dependencies and sequence mutations. Output only the requested projection or aggregate.

Use native tools directly when they already return a compact result. A server exposed only through code mode cannot also be called directly until its owner changes its exposure. Keep existing credentials, hooks and permission rules.

## Claude Code companion mod

The companion exposes `mcp__code-mode__execute` with a `code` string. The script is an async JavaScript function body. Its API is `tools.call(name, args)`, `tools.list()`, `emit(value)` and a final `return` value.

```javascript
const read = await tools.call('Read', { file_path: 'data.json' });
const rows = JSON.parse(read.result.file.content);
return { count: rows.length };
```

Inspect actual result shapes. `tools.list()` supplies names and descriptions, not input schemas. Use active declarations or direct ToolSearch for an unfamiliar schema. The final envelope contains `ok`, `value`, `output` and action receipts; failures also contain `error`. A caught underlying denial or error still makes `ok` false. Check the receipts before claiming success.

The host runs independent built-in Read/Grep/Glob calls in groups of at most four. Other tools, including MCP tools, are sequential barriers. Await a whole read group before a dependent mutation; barriers do not make a queued mutation conditional on read success. Every action still uses Claude's ordinary tool permission/hook pipeline. Running tools retain native cancellation behavior, and a failed script provides no rollback.

The guest has no Node, filesystem, environment, network, imports or persistent state. Scripts have bounded CPU time, heap, call count and output. Use direct tools for images, interaction, delegation and any capability the JSON bridge cannot preserve. Permission prompts consume the execution deadline. After cancellation or timeout, inspect actual effects before considering a retry.
