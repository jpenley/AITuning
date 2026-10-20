# Load and disable the MCP mirror

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

This guide describes owner-triggered loading. Implementation approval does not authorize installation, activation, persistent settings changes or release. Qualification did not perform those actions.

## Prepare the local package

1. Read [VERIFICATION.md](VERIFICATION.md). Accept or resolve the remaining qualification limits before loading real servers.
2. Keep the repository layout intact. The sibling companion is a local package dependency.
3. Prepare the dependencies declared in [package.json](package.json). Supply public host peers from Pi 1.3.0 rather than installing a second runtime beside Pi.
4. For checks, set `SDK_ROOT` to the public Pi 1.3.0 package root. Set `RPIV_ROOT` to the installed RPIV 2.13.9 package root.
5. Run the checked-in stock qualifier and typecheck. A nonzero exit, a missing test match or a different host version fails qualification.

The prepared local dependency workspace passed these checks. Fresh installation, peer resolution in a clean staging directory, tarball contents and Pi package-manager install/uninstall remain unverified. Do not interpret the commands below as evidence for those paths.

## Load for one session

After explicit owner approval, use Pi's normal extension loading:

```sh
pi -e /absolute/path/to/AITuning/extensions/pi-mcp-mirror/index.ts
```

This is a loading recipe, not a command run during qualification. Load the mirror once. Do not also load the companion or another `/mcp` replacement.

The mirror registers `/mcp` before session startup. Stock Pi 1.3.0 then omits its replaceable built-in session connector. Codemode and `tool_search` must remain available from the host. The package does not recreate either engine.

The stock public loader and actual default entry were tested with synthetic directories and a fake stdio peer. No persistent extension entry was added. The owner's existing `-builtin:mcp` exclusion was not changed.

## Disable controls

**Pass `--no-mcp` to disable both the mirror and native session MCP for that process.** The mirror checks Pi's public `parseArgs(process.argv.slice(2))` result when its factory runs. It registers no collector, connector tools, `/mcp` command or lifecycle handlers when disabled. Configured servers do not connect through the mirror, including after a reload. Static module imports still run.

The parser preserves native CLI semantics: `-- --no-mcp` is prompt text, and `--append-system-prompt --no-mcp` consumes the token as an option value. Neither disables MCP. Pi separately excludes its built-in connector when the switch is parsed.

The `-builtin:mcp` extension filter remains built-in-only. It does not disable the mirror. To stop loading the mirror module entirely, remove its own path or package from extension loading.

`--no-extensions` disables discovery and built-ins, but Pi still accepts explicit `-e` paths. An explicit mirror path therefore remains an opt-in load. The disable regression uses the actual package entry, synthetic process arguments and the stock public loader/session. It is not a live owner-configured CLI session.

To return to native session MCP, unload the mirror and restore native MCP through Pi's normal controls. An existing native exclusion still needs owner action. No automatic fallback rewrites settings or enables native MCP.

## Preserve permission and configuration ownership

The mirror is a non-built-in extension. Permission rules keyed to native source identity do not automatically describe it. Review the actual extension source and nested parent chain before allowing a call. Qualification never auto-approved a request or persisted a rule.

The connector retains native config locations, trust decisions, registered-server handling and credential formats. Trusted config can run commands and select endpoints; the mirror is not a sandbox. Untrusted project config still depends on the host's trust decision.

Shell-level `pi mcp` commands remain the installed native implementation. They do not operate the mirror's in-memory session state. Native CLI authentication interoperability is source-preserved, not live-qualified. In particular, the mirror-managed logout guarantee does not cover native CLI logout.

Logout deletes local mirror-managed credentials under native-compatible locking. It does not revoke a remote bearer token. Cancel an explicit sign-in before logging out; overlapping sign-in remains outside the guarantee. The [accepted lost-lease limitation](VERIFICATION.md#accepted-auth-limitation) also applies.

## Use the public SDK factory

`createMcpMirrorExtension(options)` returns an `ExtensionFactory`; importing it alone does not load it into a session. The `--no-mcp` check reads process arguments, not a per-session SDK option. `disabledBuiltinExtensions: ["mcp"]` alone still does not disable the mirror. To disable a mirror in one embedded session, omit its factory or loading entry. If you also supply a stock MCP factory, exclude that separately to prevent native fallback. SDK consumers must supply their resource loader and factories explicitly. They must also retain the host's Codemode and `tool_search` factories and normal dispatch/permission pipeline.

[test/stock.fixture.mjs](test/stock.fixture.mjs) is the qualified public-SDK construction reference. [test/default-entry.test.mjs](test/default-entry.test.mjs) covers the actual package entry through stock `createAgentSession` and `DefaultResourceLoader`. Their fake provider and UI are test boundaries, not a replacement dispatch engine.

The exported option/type surface is not a claim of every internal native helper export. Use `McpMirrorOptions` and the structural `McpCredentialStore` rather than importing private host classes.

## Requalify after a Pi update

1. Leave the version guard in place. An unsupported host must refuse loading rather than silently run an old connector.
2. Compare the new native session connector and public SDK against the [source provenance](src/support/PROVENANCE.md). Refresh upstream mirrors with their supported workflow; never edit `external/`.
3. Review intentional adaptations separately from upstream changes. Preserve host-owned Codemode, permissions, auth formats and explicit final consent.
4. Run the stock default-entry, ordinary-native differential, elicitation, cancellation, auth, resource and display regressions. Run native-derived leaf and shared patched-native contract checks in isolated profiles.
5. Review the diff and all applicable repository gates. Record source hashes, commands, exit codes, warnings, skips and unverified boundaries in verification.json (private development evidence omitted).
6. Change the supported version only after that qualification and owner approval. Loading or installing the result remains a separate action.

The checked-in [native fixture preparer](scripts/prepare-native-qualification.mjs) checks the donor SDK version and patched-source hashes. It writes marked local fixtures/config only and refuses unowned outputs and protected `external/` checkouts.
