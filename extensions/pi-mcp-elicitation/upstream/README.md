# Native Pi form elicitation patch

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

Unreleased source patch for Pi **v1.3.0**, commit `71023aec1546d6d677a65669c5665c0927ce0dd0`. It adds a form-only bridge to the callable `mcp_elicitation_v1` provider. Pi retains native MCP transport, configuration, discovery, tools, resources, and `/mcp`.

## Apply to a separate source checkout

Do not apply this patch to the installed Pi release. Use a source checkout at the exact commit above, with LF line endings. The patcher checks the version, base commit, patch digest, and every affected file. It refuses another release or partial edits rather than trying a fuzzy update.

From the AITuning repository root, check compatibility without changing files:

```sh
node extensions/pi-mcp-elicitation/scripts/native-patch.mjs "$PI_SOURCE"
```

To modify that source checkout, opt in explicitly:

```sh
node extensions/pi-mcp-elicitation/scripts/native-patch.mjs "$PI_SOURCE" --apply
```

Rebuild your source checkout using Pi's own build instructions. Launch that rebuilt host with the [companion](../README.md#load-the-companion). Keep your installed release untouched until you choose to replace it. The tooling here never installs or enables anything.

`manifest.json` records the patch SHA-256 and before/after hashes for all seven files. `pi-1.3.0-form-elicitation.patch` includes the source bridge, protocol documentation, and regression tests. It has no dependency or lockfile changes. The local qualification fixtures are generated separately.

## Windows source-test portability

The separate test-only portability patch (private development evidence omitted) targets the same Pi 1.3.0 commit. Apply it only to an isolated source checkout used for qualification, not the installed release. The form patcher does not apply this test patch automatically. Its seven-file manifest and runtime patch are unchanged.

After applying the form patch, check and apply the test patch:

```sh
git -C "$PI_SOURCE" apply --check /absolute/path/to/pi-1.3.0-windows-test-portability.patch
git -C "$PI_SOURCE" apply /absolute/path/to/pi-1.3.0-windows-test-portability.patch
```

The patch retains the exact POSIX missing-command diagnostic and checks Windows failure state, closed connection and the missing-command stderr diagnostic. It adds a broken-server-only exit check and retains the healthy-server control. The watcher child imports a `file:` URL with serialized string values; its watcher detection and emitted-error checks remain intact.

Prepare Pi's declared dependencies, including workspace-local dependency directories. Build the local TUI package before the watcher subprocess test. Qualification used its existing `tsc -p tsconfig.build.json` build, with no dependency installation. A root-only dependency link is insufficient when a workspace declares a different version.

Keep native and mirror qualification profiles separate. The native profile includes all original matching tests and the companion's two generated integration fixtures. Mirror-only generated fixtures remain in the mirror profile; their absolute TypeScript imports do not belong in native `npm run check`.

The [portability follow-up](../VERIFICATION.md#windows-portability-follow-up) records commands, prerequisite failures, the negative mutation probe and green reruns. Qualification covers English Windows diagnostics only. The POSIX assertion is retained but was not executed in this follow-up. Neither patch has been merged upstream or installed here.

## Update without silent breakage

The companion uses public extension APIs and a versioned callable-tool contract. Generic questionnaire extensions integrate through its public adapter contract, not guessed tool names. RPIV 2.13.9 is a qualified adapter, not a promise that future RPIV schemas are compatible.

This native bridge still needs upstream adoption. Until it ships in Pi, each new Pi version requires a separately reviewed and qualified native patch. Do not apply the 1.3.0 patch to a newer release. A normal Pi update does not preserve an unmerged source patch. The guard and conditional capability negotiation fail closed, rather than claiming update-proof support.

The [verification record](../VERIFICATION.md) lists the tested versions, commands, existing skips, and unverified UI coverage.
