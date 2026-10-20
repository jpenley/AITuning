# Pi MCP elicitation companion

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

Unreleased companion for patched Pi 1.3.0 native MCP support. It collects flat form values and asks for separate consent before returning them to the requesting server.

**Standalone native MCP use requires the native elicitation patch.** The [MCP mirror](../pi-mcp-mirror/README.md) includes its own connector and registers this collector on stock Pi 1.3.0 without patching the host. Do not load the collector twice. It does not enable, inspect, or modify native MCP settings. The [native source patch](upstream/README.md) is pinned to Pi 1.3.0. This package never edits the installed host.

- [Load the companion](#load-the-companion)
- [Choose a collector](#choose-a-collector)
- [Supported form subset](#supported-form-subset)
- [Register another adapter](#register-another-adapter)
- [Cancellation and trust boundaries](#cancellation-and-trust-boundaries)
- [Run the checks](#run-the-checks)

## Load the companion

With Node.js 24 or newer and the patched Pi host, load this directory explicitly:

```sh
pi --extension ./extensions/pi-mcp-elicitation/index.ts
```

Stock Pi 1.3.0 does not advertise elicitation. First apply the [native patch](upstream/README.md) to a separate source checkout and rebuild that host. Loading this extension into stock Pi cannot add the missing protocol handler.

The patched host advertises form elicitation when both this callable provider and a UI are available at connection time. There is no separate elicitation setting. Load the companion before connecting, or run `/mcp reconnect <server>` afterward.

You must enable native MCP yourself. An existing `-builtin:mcp` exclusion still wins. This extension never changes it, replaces `/mcp`, or grants permissions. No dependencies need installing in this directory.

The callable tool is `mcp_elicitation_v1`, with `exposure: "codemode"`. Native calls it through the real parent `ExtensionToolContext.executeTool`:

```ts
{
  server: string,
  source: string,
  request: {
    mode?: "form",
    message: string,
    requestedSchema: object
  }
}
```

The declared `outputSchema` describes `structuredContent`: `{ action: "accept" | "decline" | "cancel", content?: object }`. Only acceptance includes validated values. Model-facing `content` is a fixed completion notice; `details` is undefined. Answers are not logged, persisted, or placed in model-facing text. Native must call this tool as a nontranscript nested operation and independently validate both request and response. Code that explicitly prints structured results can still disclose them.

## Choose a collector

Set `PI_MCP_ELICITATION_PROVIDER` before starting Pi, or run `/mcp-elicitation-provider ID`. IDs are `auto`, `native`, `rpiv`, or an adapter ID. With no ID, `/mcp-elicitation-provider` reports the configured provider and last selected collector. The command does not write settings. Unknown IDs fail technically before collection.

Auto selection prefers verified RPIV, then supported registered adapters sorted by ID, then the built-in native dialogs. An unavailable or unrepresentable collector uses native dialogs **before collection**. Once a collector starts, there is no retry with another UI, including after cancellation, gate denial, partial results, or errors.

RPIV recognition requires all of these conditions:

- A callable `ask_user_question` in `ctx.tools`, without activating it.
- Package-origin `sourceInfo` identifying the npm package, optionally pinned to `2.13.9`, or its verified local package directory.
- The expected parameter schema and an entry-point package identity of version `2.13.9`.
- TUI mode. RPC always uses the built-in dialogs because RPIV's public answer channel cannot cancel its RPC dialog walker.

Local installs must load as a Pi package, not as a bare extension file. Wrappers, other versions, and arbitrary tools with the same name use native dialogs unless you supply an adapter. After an RPIV update, rerun the integration check and inspect `/mcp-elicitation-provider` to detect fallback.

RPIV supports one to four representable questions, each with two to four generated choices. It maps required booleans, optional booleans with an explicit omit choice, string enums with an allowed choice count including omission, and required string-enum multiselects. Other forms use native dialogs. Headers are `F1` through `F4`; choice labels are `C1` through `C4`. Original values and titles appear only as escaped descriptions. Returned labels are looked up, never interpreted as custom text. Notes are ignored. Partial, custom, malformed, or error results cannot accept.

The native collector uses public `ctx.ui.select` and `ctx.ui.input`. Arrays get an include/exclude selector per allowed value. Optional fields get a separate provide/omit selector. Invalid input fails technically rather than silently coercing or submitting a default.

Both collectors require a final trusted **Accept / Decline / Cancel** selector showing the server, source, and escaped summary. Accept sends the reviewed snapshot; Decline withholds it; dismissal or Cancel returns cancellation. Selecting fields or defaults is not consent. A cancellation during collection ends the operation without a consent prompt.

## Supported form subset

All unsupported assertions fail before any UI opens. The v1 subset is:

- Root `type: "object"`, a `properties` object with at most 32 flat fields, optional `required` containing only existing field names, and `additionalProperties: false` or omitted.
- Root annotations: `title`, `description`, a validated `default`, and `$schema` for draft 2020-12 or draft-07. Field annotations: `title`, `description`, and a validated `default`.
- Boolean fields.
- String fields with `minLength`, `maxLength`, and `format: email | uri | date | date-time`.
- Number and integer fields with `minimum` and `maximum`. Magnitudes stay within the safe-integer range; integer values and bounds must be safe integers.
- String enums using `enum` with optional `enumNames`, or titled `oneOf` entries containing `const` and `title`.
- String-enum arrays using `items.type: "string"` with `enum` / `enumNames` or titled `anyOf` entries, and optional `minItems` / `maxItems`. The item type may be omitted for titled `anyOf`. Selections are unique.

Nested objects, general arrays, references, patterns, and unknown keywords are rejected. Email validation is a conservative mailbox check, not full RFC mailbox syntax. URI validation requires escaped ASCII and an absolute WHATWG URL, without fetching or opening it. Dates use calendar checks; date-times require an explicit offset and do not support leap seconds.

Requests and collected content are limited to 64 KiB of JSON each. Bridge metadata has its own 64-KiB limit. Collector and action wrappers allow at most 64 extra bytes, without reducing the content allowance. Individual strings and keys are limited to 8192 Unicode codepoints. Each enum allows at most 128 distinct values. ANSI, OSC, C0/C1 controls, and bidi controls are escaped for display only. Values retain their original content, including own properties named `__proto__`.

## Register another adapter

Arbitrary ask-user tools need an adapter or this shared contract. Naming a tool is not enough to establish its result semantics, cancellation, or provenance.

Import `registerElicitationAdapter` from the public `pi-mcp-elicitation/adapters` export, or this directory's `src/adapters.mjs`. The entry point also re-exports it:

```ts
const dispose = registerElicitationAdapter(pi, {
  version: 1,
  id: "my-collector",
  supports: ({ form, ctx }) => ctx.hasUI && canRepresent(form),
  collect: async ({ form, ctx, signal, callId }) => {
    // Use public UI APIs or a known callable tool. Honor signal and await cleanup.
    // Return { content: flatValues } or { cancelled: true }.
    return collectValues(form, ctx, signal, callId);
  },
});
// Call dispose() when the provider is withdrawn.
```

`form` is an immutable normalized request with `server`, `source`, `message`, and `fields`. Each field contains `name`, `schema`, `required`, and optional `choices: { value, label }[]`. Adapters collect values, not actions. The coordinator owns validation, review, and the final action. Treat adapters as trusted in-process extensions, not a sandbox.

The versioned in-process bus contract uses `pi:mcp-elicitation:discover.v1`. The coordinator emits `{ version: 1, signal, register(adapter) }` once per operation. Providers register synchronously while that callback is open. The signal belongs to that operation/session; adapters must not retain the registration callback or answers. Discovery on demand handles either load order without a global registry. `pi:mcp-elicitation:changed.v1` announces provider registration or disposal. The helper disposes on `session_shutdown`, aborts active collection on disposal, and rejects stale completion. Pi tracks bus subscriptions for runtime invalidation. Re-register after a fresh runtime loads.

## Cancellation and trust boundaries

One FIFO lane serializes this companion's UI across a session. Queued aborts do not open UI or release the active operation's slot. Operation, context, and session signals are combined. Session replacement or shutdown invalidates pending work. Old dialogs must close before the next queued UI starts.

RPIV 2.13.9 ignores the execute signal. The adapter listens for its public prompt event, matches only an immediate nested ID under the current companion call, and sends `{ toolCallId, cancel: true }` on its public answer event. It awaits the nested call's cleanup before releasing the lane. Native dialogs receive their supported abort signal. There is no synthetic keyboard input or prototype patching.

This queue does not serialize unrelated extensions' UI. The native patch owns per-connection MCP scope serialization. A future adapter that ignores cancellation can hold the lane until it finishes; stale values still cannot gain consent. No model calls, network requests, URL opening, credential access, or permission persistence are part of this companion.

Untrusted server schemas cross the parser boundary; provider results cross the content validator; displayed server text crosses the terminal encoder; explicit final consent is the send boundary. Schema limits address resource exhaustion, strict result mapping addresses substitution, and nontranscript structured results limit answer disclosure. Installed extensions and the event bus share process privileges and are not adversarial isolation boundaries.

## Run the checks

The [verification record](VERIFICATION.md) distinguishes local source qualification from installed behavior. The tests fail, rather than skip, when their explicit prerequisites are missing.

Run pure checks from the repository root:

```sh
node --test extensions/pi-mcp-elicitation/test/coordinator.test.mjs extensions/pi-mcp-elicitation/test/form.test.mjs extensions/pi-mcp-elicitation/test/providers.test.mjs extensions/pi-mcp-elicitation/test/patch.test.mjs
```

For installed-SDK compatibility, set `SDK_ROOT` and `RPIV_ROOT` to those installed package directories:

```sh
node --test extensions/pi-mcp-elicitation/test/sdk.test.mjs
```

The SDK fixture loads real entry points and answers RPIV through its public event channel. It supplies nested dispatch and provenance itself, so it is not proof of the full native path.

For the real native path, use an isolated, patched Pi 1.3.0 source checkout with its dependencies installed. Generate the qualification fixtures, then run them with that checkout's Vitest:

```sh
node extensions/pi-mcp-elicitation/scripts/prepare-native-test.mjs "$PI_SOURCE" "$RPIV_ROOT"
cd "$PI_SOURCE/packages/coding-agent"
node ../../node_modules/vitest/dist/cli.js --run test/suite/aituning-elicitation.integration.test.mjs test/suite/aituning-contract.integration.test.mjs
```

These fixtures load both packages through Pi's real resource loader. They test actual AgentSession nested execution, permission gates, final consent, wire replies, and the same contract table against both validators. Only the remote server, faux model, and UI responses are controlled. Tests isolate settings and reject fetch. Generated `aituning-*.integration.test.mjs` files remain local and are excluded from the upstream patch.

Actual terminal rendering and a live RPC client are not covered. These tests do not change the installed release or live settings.

To check this README from the repository root:

```sh
node packs/writing/skills/prose/scripts/lint-prose.mjs extensions/pi-mcp-elicitation/README.md
```
