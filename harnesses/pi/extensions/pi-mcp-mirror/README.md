# Pi MCP mirror

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

An opt-in, native-derived session MCP connector with form elicitation. Pi's stock Codemode and `tool_search` remain host-owned. The mirror includes the [elicitation companion](../pi-mcp-elicitation/README.md), including RPIV and adapter support.

Historical local qualification covers Pi **1.3.0** and **1.4.0**. The approval-deadline change has been active in the checkout Pi loads since 2026-10-27, and a live Pi approval window has been tested with it. Other versions emit a warning and continue loading when the mirror is enabled; that does not establish compatibility. Start with the [verification record](VERIFICATION.md), then read the [loading guide](ACTIVATION.md).

## What it replaces

When enabled, the default entry registers `/mcp` during factory loading. Pi 1.3.0 uses that registration to replace its replaceable session MCP extension. Exactly one session connector is expected. The mirror does not patch Pi or replace shell-level `pi mcp` commands.

The connector retains native tool naming, namespace discovery, schemas, resource handling, config trust and OAuth formats. Calls still use the host's tool dispatch, permission checks, result hooks and cancellation pipeline. The [verification matrix](VERIFICATION.md#acceptance-matrix) states the scope of those claims.

Form answers require a separate final **Accept**, **Decline** or **Cancel** selection. Answer collection is not consent. Denial, cancellation, invalid results and stale calls never grant permission or trigger another questionnaire.

The 2026-10-22 Pi 1.4.0 checks passed all 28 stock integration tests, including form consent, permission denial, cancellation, OAuth logout and resource attribution. The companion passed all 52 tests. Those historical results do not cover later source changes. See the [Pi 1.4.0 evidence](VERIFICATION.md#pi-140-qualification-2026-10-22) for repairs, receipts and scope.

## Prerequisites

Keep this package beside `../pi-mcp-elicitation`: its dependency is a local `file:` reference. The package requires Node 24 or later. Qualification used Node 24.19.0 on Windows x64 and RPIV 2.13.9. With RPIV 2.15.0 the stock suite passes 28/28 on the native-dialog path, because RPIV is now model-only and cannot be nested.

Provide the public host peers declared in [package.json](package.json) from one compatible Pi release. Do not bundle another physical Pi SDK, agent core, AI runtime or TUI runtime. The declared `pi-mcp` and locking dependencies are explicit runtime dependencies, not replacements for Codemode.

The local dependency workspace was prepared for qualification. A fresh install, packed artifact and Pi package-manager installation have not been qualified.

## Public seams

- The default entry is [index.ts](index.ts). It registers the collector and connector together. Do not also load the companion as a separate extension.
- `createMcpMirrorExtension(options)` returns a public `ExtensionFactory`. `McpMirrorOptions` retains the extracted connector's dependency-injection options.
- `McpCredentialStore` is structural. Its `forServer(name, serverUrl)`, `tokens(name, serverUrl)` and `remove(name, serverUrl)` methods support synthetic stores without constructing a private SDK class.
- `registerElicitationAdapter` is exported from the root and `pi-mcp-mirror/adapters`. The [companion adapter contract](../pi-mcp-elicitation/README.md) defines discovery and result validation.

An arbitrary tool named `ask_user` is not assumed compatible. RPIV is recognized through its qualified contract and provenance. Other question extensions need an adapter; unsupported forms can use native dialogs before another provider is attempted.

## Important differences

**`--no-mcp` disables this mirror as well as native session MCP.** The mirror uses Pi's public argument parser before registering tools, commands or lifecycle handlers. The built-in-only `-builtin:mcp` filter does not disable the mirror. See [disable controls](ACTIVATION.md#disable-controls).

The mirror has extension provenance, not built-in permission identity. Existing source-scoped rules may need separate owner review. When form capability is enabled, operations on one MCP connection are serialized to keep a form attached to its caller. Different servers can still run concurrently.

Native auth formats and locking are retained. A suspended writer that loses a stale lease can recreate credentials after another session logs out. This accepted limitation is not fencing or unconditional cross-process logout safety. See [auth limits](VERIFICATION.md#accepted-auth-limitation).

## Human approval deadlines

The [deadline adapter](src/mcp/approval-client.ts) excludes human waiting from positive client request deadlines. It pauses the remaining active-time budget while the existing elicitation dispatcher waits, then resumes it. It adds no fixed human-response deadline and does not grant consent, replay calls, or change permission rules. Ordinary operation deadlines, progress renewal, cancellation and connection shutdown remain active.

The existing per-connection serialization remains: another call on that connection waits behind the form. Other connections can continue. Session replacement and stale-scope checks still apply. This is not a durable approval inbox; it cannot preserve a form across process exit or guarantee that a remote server has no independent deadline. One live Pi window has been tested; that does not prove indefinite reliability. See the [current source evidence](VERIFICATION.md#approval-deadline-source-change-2026-10-27).

## Maintenance

The [provenance record](src/support/PROVENANCE.md) identifies upstream sources, hashes, adaptations and the native MIT notice. The [loading guide](ACTIVATION.md#requalify-after-a-pi-update) defines update qualification. The package needs no installed-release patch. A version mismatch warns without blocking loading; compatibility with future Pi releases still needs qualification.
