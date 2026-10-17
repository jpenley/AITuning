# Code mode for Claude Code

Compose existing session tools in isolated JavaScript and return a compact answer. The mod sends every underlying action through Claude Code's `$.tool.call()`, including its tool permissions and hooks. It starts no agent session or network service.

- [Install](#install)
- [Call the tool](#call-the-tool)
- [Parallel reads](#parallel-reads)
- [Results and limits](#results-and-limits)
- [Develop and verify](#develop-and-verify)
- [API sources](#api-sources)

## Install

Requires Claude Code 2.1.293 or later and Node.js 20 or later on `PATH`. The checked-in `dist/broker.mjs` contains the QuickJS runtime, so users do not need npm or a dependency install.

From the AITuning checkout, register the separate local marketplace and install the mod:

```text
claude plugin marketplace add ./mods
claude plugin install code-mode@aituning-mods
```

Restart Claude Code or run `/reload-plugins` in an existing session. For a single development session, use `claude --plugin-dir ./mods/code-mode`. If Node is absent, execution fails visibly. Direct tools remain available.

## Call the tool

Claude sees `mcp__code-mode__execute` with one argument, `code`. The string is the body of an async JavaScript function:

```javascript
const read = await tools.call('Read', { file_path: 'data.json' });
const data = JSON.parse(read.result.file.content);
return { count: data.length };
```

The guest receives `tools.call(name, args)`, `tools.list()`, and `emit(value)`. Calls return the host's structured `result` and model-facing `text`; inspect the actual tool result shape. `text` can contain line numbers and truncation. Read explicit ranges when the source exceeds the tool's limits. An implicit partial text-file read is reported as an error rather than a complete data source.

`tools.list()` returns currently available names and descriptions. It does not invent input schemas. Use the existing tool declaration or direct `ToolSearch` before unfamiliar calls. Deferred tools become usable when they appear in the session's tool list. Unknown tools and recursive code-mode calls are refused.

Await calls and return only the requested fields. Mutations take effect immediately. A failed script does not roll them back, and neither the runtime nor the transport retries them.

Use direct tools for single simple calls, images, interactive tools, subagents, or capabilities this JSON bridge cannot preserve. The global routing rule leaves those routes available.

## Parallel reads

Use `Promise.all` for independent built-in `Read`, `Grep`, or `Glob` calls. The host dispatches contiguous pending reads in groups of up to four:

```javascript
const paths = ['first.json', 'second.json'];
const results = await Promise.all(paths.map(file_path =>
  tools.call('Read', { file_path })
));
return results.map(result => JSON.parse(result.result.file.content).id);
```

Await a result before computing a dependent request. Await the whole read group before using its results in a mutation. `Promise.all` preserves input order when calls finish out of order. Parallel reads do not provide a consistent snapshot of files that another process changes.

Every other tool is a sequential barrier, including `Write`, `Edit`, `Bash`, and MCP tools. A barrier waits for the preceding group and finishes before the next begins. Read-only descriptions, annotations, and guest flags cannot change this classification. Each concurrent action still passes through the normal `$.tool.call()` permission and hook path.

The host waits for all started siblings before advancing or cleaning up, including when a transport call fails. Cancellation or expiry prevents another group from starting. Already-running tools retain Claude's cancellation behavior. A denial remains visible even when a sibling succeeds or the guest catches the error. Barriers enforce ordering, not rollback or conditional execution: do not queue a mutation alongside reads it depends on.

The host also checks returned receipt IDs and statuses against its own action records. A mailbox result cannot erase a host-observed denial or turn it into success. Existing reply files are refused before writing, with no action replay.

## Results and limits

The result is JSON with `ok`, `value`, `output`, and a `calls` receipt. Failures include `error`. A caught denial or tool error remains visible in the receipt and makes `ok` false. On host failure, receipts identify actions already completed. A cancelled or expired call is not evidence that an in-flight mutation was undone.

| Resource | Limit |
|---|---|
| Script | 16,384 characters |
| Calls | 32 per script; up to four independent built-in reads at once; other tools sequential |
| Tool arguments | 65,536 characters per request |
| Tool result | 2 MiB per reply; larger results fail visibly |
| Guest heap | 32 MiB |
| Guest deadline | 60 seconds, including time waiting for tools |
| Returned guest output | 16,000 characters and 100 emitted items |

The guest has no host filesystem, Node APIs, environment, network, timers, imports, or persistent state. It can reach outside only through session tools. The trusted Node broker exchanges JSON through a private temporary mailbox. The host uses the mod SDK filesystem only for these broker control files. Requested user-file reads still use `$.tool.call()` and its normal permissions. A reply becomes readable only after its complete JSON write and a separate completion marker.

SDK polling sleeps total at most 250 ms per execution, then a blocking helper handles longer waits. This keeps polling within the hook's own execution budget while retaining the 60-second guest deadline. Large final diagnostic receipts also use the original process transport. Initialization and cleanup remain in the native broker, which validates the temporary root, owner nonce, and expiry. Normal completion cleans the mailbox. An abrupt host or process termination can leave a temporary directory named `aituning-codemode-*`; never delete one belonging to an active run.

The mod's deadline stops guest computation and scheduling. Claude Code retains control of cancellation for an underlying tool already running. Permission prompts consume the deadline; if one expires, check the action's actual state before deciding whether to retry.

## Develop and verify

From this folder, install the pinned build dependencies with lifecycle scripts disabled and rebuild the self-contained runtime:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
claude plugin validate . --strict
claude plugin test .
```

The source files under `scripts/` own runtime behavior; `dist/` is a generated distribution artifact. Rebuild it after source changes. The pinned runtime is QuickJS Emscripten 0.32.0; bundled licences are in `dist/`.

The build preserves the upstream Emscripten loader's URL-probe and memory-growth fallbacks, but logs their caught errors to stderr. It requires exactly two matching upstream handlers and fails if the pinned source changes. Dependencies and the repository's floor guard remain unchanged.

The [code-mode guide](../../CODE_MODE.md) explains Pi setup, shared routing, and the bounded benchmark summary. This distribution includes offline runtime tests; paid benchmark scripts and private run records are omitted.

## API sources

The implementation follows Claude's [mod authoring restrictions](https://code.claude.com/docs/en/plugins/mods/create), [mods API](https://code.claude.com/docs/en/plugins/mods/api), and [published types](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts). QuickJS integration follows its [primary documentation](https://github.com/justjake/quickjs-emscripten).
