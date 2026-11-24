# Pi MCP elicitation companion

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

Unreleased companion for Pi native MCP elicitation support. Its built-in TUI keeps request details, editable fields, and the final send decision in one window. Pi 1.3.0 has historical qualification; [Pi 1.4.0 qualification](VERIFICATION.md#pi-140-qualification-2026-10-22) covers the companion with the mirror and verifies native source patch applicability.

**Standalone native MCP use requires the native elicitation patch.** The [MCP mirror](../pi-mcp-mirror/README.md) includes its own connector and registers this collector on stock Pi 1.3.0 and 1.4.0 without patching the host. Do not load the collector twice. It does not enable, inspect, or modify native MCP settings. The [native source patch](upstream/README.md) was qualified on Pi 1.3.0. Other versions receive a compatibility warning and undergo the same exact source-hash checks. This package never edits the installed host.

- [Load the companion](#load-the-companion)
- [Use the single-window form](#use-the-single-window-form)
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

## Use the single-window form

In TUI mode, `auto` and `native` use the same form for every supported field type. The window shows the requester, readable request paragraphs, and editable response fields. Boolean choices say **Yes** and **No**. Defaults appear as hints, not preselected answers.

The review pane contains the full request, configuration source, selected field's description and constraints, and its complete response value or draft. Long values remain scrollable even when their labels are identical. Server text is marked untrusted. Access scope, purpose, and duration remain requester-supplied descriptions; the companion does not infer missing task identity or lifetime.

With the default keybindings:

- Use the arrow keys to select a field or choice.
- Press Enter to edit a field, choose an answer, or save a field value within the form. Saving a field does not send it.
- Press Tab to switch between fields and the final actions. Invalid input never prevents Decline or Cancel.
- Press F2, or click its return control, to return to the field list. In a text editor, this discards the pending edit and preserves the previous saved value.
- Press Delete in the field list to clear a value or leave an optional field out.
- Use Page Up and Page Down to scroll the review pane, including the complete selected value.

**Send response** validates and sends the entered values. **Decline request** withholds all values. **Cancel** or Escape cancels without sending values. Choosing an answer or finishing an edit is never the final send action.

Below 12 terminal rows, the form pauses with a resize notice. Drafts survive resizing, and Escape still cancels. No response can be sent while the form is paused.

## Choose a collector

Set `PI_MCP_ELICITATION_PROVIDER` before starting Pi, or run `/mcp-elicitation-provider ID`. IDs are `auto`, `native`, `rpiv`, or an adapter ID. With no ID, `/mcp-elicitation-provider` reports the configured provider and last selected collector. The command does not write settings. Unknown IDs fail technically before collection.

Auto selection uses the single-window TUI when custom components are available. Selecting `native` also uses that form. Explicit `rpiv` or adapter IDs retain their collector and separate final review.

Without the custom TUI capability, auto selection prefers verified RPIV, supported adapters sorted by ID, then native dialogs. RPC uses a compatible collector rather than the custom TUI. An unavailable or unrepresentable collector falls back to native dialogs **before collection**. Once any UI starts, there is no retry with another UI after cancellation, gate denial, partial results, or errors.

RPIV recognition requires all of these conditions:

- A callable `ask_user_question` in `ctx.tools`, without activating it.
- Package-origin `sourceInfo` identifying the npm package, optionally pinned to its installed version, or its verified local package directory.
- The expected parameter schema and the exact package name and `index.ts` entry point.
- TUI mode. RPC always uses the built-in dialogs because RPIV's public answer channel cannot cancel its RPC dialog walker.

Local installs must load as a Pi package. RPIV 2.13.9 is the qualified baseline. Other installed versions warn once per package entry and version, then attempt the adapter when schema and provenance checks pass. Wrappers and arbitrary tools with the same name use native dialogs unless you supply an adapter. After an RPIV update, rerun the integration check and inspect `/mcp-elicitation-provider` to detect fallback.

RPIV 2.15.0 declares `ask_user_question` model-only (upstream #310), so other tools cannot call it and the RPIV collector is never selected: forms use native dialogs and the same final review. This is interim; a consolidated ask-user component is planned.

RPIV supports one to four representable questions, each with two to four generated choices. It maps required booleans, optional booleans with an explicit omit choice, string enums with an allowed choice count including omission, and required string-enum multiselects. Other forms use native dialogs. Headers are `F1` through `F4`; choice labels are `C1` through `C4`. Original values and titles appear only as escaped descriptions. Returned labels are looked up, never interpreted as custom text. Notes are ignored. Partial, custom, malformed, or error results cannot accept.

The legacy native collector uses public `ctx.ui.select` and `ctx.ui.input`. Arrays get an include/exclude selector per allowed value. Optional fields get a separate provide/omit selector. Invalid input fails technically rather than silently coercing or submitting a default.

The legacy RPIV and native collectors, and registered adapters, require a final trusted **Accept / Decline / Cancel** selector showing the server, source, and escaped summary. Accept sends the reviewed snapshot; Decline withholds it; dismissal or Cancel returns cancellation. Selecting fields or defaults is not consent. A cancellation during collection ends the operation without a consent prompt.

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

Requests and collected content are limited to 64 KiB of JSON each. Bridge metadata has its own 64-KiB limit. Collector and action wrappers allow at most 64 extra bytes, without reducing the content allowance. Individual strings and keys are limited to 8192 Unicode codepoints. Each enum allows at most 128 distinct values. ANSI, OSC, C0/C1 controls, and bidi controls are escaped for display only. Display encoding does not rewrite response values, including enum strings and own properties named `__proto__`. The text editor preserves spaces and newlines, normalizes pasted line endings and tabs through the SDK, and rejects unsafe control characters.

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

The versioned in-process bus contract uses `pi:mcp-elicitation:discover.v1`. For a collector-based operation, the coordinator emits `{ version: 1, signal, register(adapter) }` once. The built-in single-window form does not discover adapters. Providers register synchronously while that callback is open. The signal belongs to that operation/session; adapters must not retain the registration callback or answers. Discovery on demand handles either load order without a global registry. `pi:mcp-elicitation:changed.v1` announces provider registration or disposal. The helper disposes on `session_shutdown`, aborts active collection on disposal, and rejects stale completion. Pi tracks bus subscriptions for runtime invalidation. Re-register after a fresh runtime loads.

## Cancellation and trust boundaries

One FIFO lane serializes this companion's UI across a session. Queued aborts do not open UI or release the active operation's slot. Operation, context, and session signals are combined. Session replacement or shutdown invalidates pending work. Old dialogs must close before the next queued UI starts.

RPIV 2.13.9 ignores the execute signal. The adapter listens for its public prompt event, matches only an immediate nested ID under the current companion call, and sends `{ toolCallId, cancel: true }` on its public answer event. It awaits the nested call's cleanup before releasing the lane. Native dialogs receive their supported abort signal. There is no synthetic keyboard input or prototype patching.

This queue does not serialize unrelated extensions' UI. The native patch owns per-connection MCP scope serialization. A future adapter that ignores cancellation can hold the lane until it finishes; stale values still cannot gain consent. No model calls, network requests, URL opening, credential access, or permission persistence are part of this companion.

Untrusted server schemas cross the parser boundary; provider results cross the content validator; displayed server text crosses the terminal encoder; explicit final consent is the send boundary. Schema limits address resource exhaustion, strict result mapping addresses substitution, and nontranscript structured results limit answer disclosure. Installed extensions and the event bus share process privileges and are not adversarial isolation boundaries.

## Run the checks

The [verification record](VERIFICATION.md) distinguishes local source qualification from installed behavior. The tests fail, rather than skip, when their explicit prerequisites are missing.

Run pure checks from the repository root:

```sh
node --test harnesses/pi/extensions/pi-mcp-elicitation/test/coordinator.test.mjs harnesses/pi/extensions/pi-mcp-elicitation/test/form.test.mjs harnesses/pi/extensions/pi-mcp-elicitation/test/providers.test.mjs harnesses/pi/extensions/pi-mcp-elicitation/test/patch.test.mjs
```

For installed-SDK compatibility, set `SDK_ROOT` and `RPIV_ROOT` to those installed package directories:

```sh
node --test harnesses/pi/extensions/pi-mcp-elicitation/test/sdk.test.mjs harnesses/pi/extensions/pi-mcp-elicitation/test/ui.test.mjs
```

The SDK fixtures load real entry points, drive the one-window form through its public component API, and answer explicit legacy RPIV calls through its public event channel. They supply nested dispatch and provenance themselves, so they are not proof of the full native path. The TUI checks use the real toolkit's rendering, keyboard, mouse, and focus APIs with a controlled terminal boundary.

For the real native path, use an isolated Pi source checkout with native elicitation support and its dependencies installed. Pi 1.3.0 is the qualified baseline. The fixture generator warns for other Pi, RPIV, or companion versions and checks package identities, extension declarations, and required files. Generate the qualification fixtures, then run them with that checkout's Vitest:

```sh
node harnesses/pi/extensions/pi-mcp-elicitation/scripts/prepare-native-test.mjs "$PI_SOURCE" "$RPIV_ROOT"
cd "$PI_SOURCE/packages/coding-agent"
node ../../node_modules/vitest/dist/cli.js --run test/suite/aituning-elicitation.integration.test.mjs test/suite/aituning-contract.integration.test.mjs
```

These fixtures explicitly select legacy RPIV and load both packages through Pi's real resource loader. They retain the original AgentSession nested-execution, permission-gate, final-consent, wire-reply, and shared-validator assertions. They do not add a native end-to-end case for the one-window UI. Only the remote server, faux model, and UI responses are controlled. Tests isolate settings and reject fetch. Generated `aituning-*.integration.test.mjs` files remain local and are excluded from the upstream patch.

Actual terminal rendering and a live RPC client are not covered. These tests do not change the installed release or live settings.

To check this README from the repository root:

```sh
node skills/packs/writing/skills/prose/scripts/lint-prose.mjs harnesses/pi/extensions/pi-mcp-elicitation/README.md
```
