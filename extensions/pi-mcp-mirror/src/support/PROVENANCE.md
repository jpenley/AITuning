# Native extraction provenance

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

Target: Pi 1.3.0, upstream `71023aec1546d6d677a65669c5665c0927ce0dd0` (SPEC pin; not independently requalified here).

Read-only extraction root: private development evidence (omitted).
Read-only clean oracle root: private development evidence (omitted).
These paths record provenance only; runtime code does not import either checkout.
Hashes are SHA-256 of original file bytes, before import adaptation.

| Source path relative to roots | Patched source SHA-256 | Clean baseline SHA-256 |
| --- | --- | --- |
| `packages/coding-agent/src/extensions/mcp/index.ts` | `5a171a246151a7155d94e3182da6002cd434341a4ab26230844747efc91e1565` | `65f505cdebdb959b5315fabad611ea34995346bcc3f6228d17b0e1ef749c60db` |
| `packages/coding-agent/src/extensions/mcp/runtime.ts` | `13b729abd206b0587f75e25a719352ccf6cf8720cdea4fba0cb3aeb045d96aab` | `f2bf62f39179e2d956df3783f1d561667c589afd6f6ee94ebdaeaf6b22de154c` |
| `packages/coding-agent/src/extensions/mcp/runtime.lazy.ts` | `ff26d6c1aefacd0e3434f82a988b5d02bd7994163316c05c84671adda0467473` | `ff26d6c1aefacd0e3434f82a988b5d02bd7994163316c05c84671adda0467473` |
| `packages/coding-agent/src/extensions/mcp/config.ts` | `c75f0659bdbc19f8f90798ee1759dd079b8fac97bb51e5f250f782771710149f` | `c75f0659bdbc19f8f90798ee1759dd079b8fac97bb51e5f250f782771710149f` |
| `packages/coding-agent/src/extensions/mcp/log.ts` | `6e4d70a321a4dce8946b208276cee50bb8b3d9908894dc12af833754dde0e407` | `6e4d70a321a4dce8946b208276cee50bb8b3d9908894dc12af833754dde0e407` |
| `packages/coding-agent/src/extensions/mcp/oauth.ts` | `7a92a0c405058929582fcd27d9e586f309281e3d4dc980a20caab5b288b050d9` | `7a92a0c405058929582fcd27d9e586f309281e3d4dc980a20caab5b288b050d9` |
| `packages/coding-agent/src/extensions/mcp/elicitation.ts` | `e21dfa950390d19cf5a35924331625af06e926427df9e4db7deba6b416e90ef7` | not present |
| `packages/coding-agent/src/core/mcp-servers.ts` | `0aaad23b26f31f743bdd117754f4c871ea821279bf68f8ba5d71eccbb1602c6a` | `0aaad23b26f31f743bdd117754f4c871ea821279bf68f8ba5d71eccbb1602c6a` |
| `packages/coding-agent/src/core/resolve-config-value.ts` | `0f53dad47fe5d5d8837c022b7951ccd3bd5a9b577bd662f0986272110e83bcc7` | `0f53dad47fe5d5d8837c022b7951ccd3bd5a9b577bd662f0986272110e83bcc7` |
| `packages/coding-agent/src/core/auth-storage.ts` | `163626f5abc34099a9afb2803d0cc49b9c66d0feacd605165e88063c328cef68` | `163626f5abc34099a9afb2803d0cc49b9c66d0feacd605165e88063c328cef68` |
| `packages/coding-agent/src/utils/paths.ts` | `64c3ebef724fa21ed0042e127908b4323a5d2f1b8aaa91eee550442332fe8502` | `64c3ebef724fa21ed0042e127908b4323a5d2f1b8aaa91eee550442332fe8502` |
| `packages/coding-agent/src/utils/open-browser.ts` | `134233cdbc3079566b217a5714461ba8189a1673ea1380e8e081f8d3bc4f00ef` | `134233cdbc3079566b217a5714461ba8189a1673ea1380e8e081f8d3bc4f00ef` |
| `LICENSE` | `0457f5bcec3b3b211605dfb5d1a49042fd638f3686a410fe099c24a25af13c48` | `0457f5bcec3b3b211605dfb5d1a49042fd638f3686a410fe099c24a25af13c48` |

## Owned adaptations

- `mcp/{index,runtime,runtime.lazy,config,log,oauth,elicitation}.ts` extracted from the patched source. Native `createMcpExtension` name and option seams retained. Elicitation validator and scopes unchanged except public SDK type import.
- Private config and extension/model-registry imports replaced with the public `@earendil-works/pi-coding-agent` root. Project trust still comes from `ctx.isProjectTrusted()`; provider credentials still delegate to the host public credential interface on each request.
- Codemode and tool_search imports replaced by name constants only. No engine copied or registered here.
- `support/mcp-servers.ts` retains native validation, exposure, matching, namespace, and resource helpers/types; the native `McpServerRegistry` implementation is deliberately excluded. Live registrations remain owned by `pi.getMcpServers()` and `mcp_servers_change`.
- `support/resolve-config-value.ts` retains the native uncached resolution/OrThrow path, interpolation, shell fallback and errors. Public SDK `getShellConfig` replaces its private import. Cached/general auth/model resolution APIs excluded.
- `support/credential-storage.ts` extracts only synchronous `FileAuthStorageBackend` persistence and its structural `withLock` seam. No default `auth.json`, async backend, provider credential store, cache, model registry or provider orchestration. Native path normalization is selected in `support/paths.ts`. Native create permissions (0600/0700), `.lock` path behavior and bounded ELOCKED/Windows EPERM retries retained.
- OAuth refresh locks, names, token keys, migration and on-demand store reads retained. Native client name `pi` is a local constant; no package identity substitution. Public `pi-mcp` and `pi-mcp/oauth` implementations are reused. The native OAuth HTML page helper is copied unchanged into `support/oauth-page.ts`: Pi 1.3.0 jiti incorrectly rewrites the public `pi-ai/utils/oauth-page` subpath through its root compat alias.
- `support/open-browser.ts` retains the no-shell platform launcher. Empty browser/log/startup-notification handlers and silently ignored operational cleanup/refresh failures now report fixed-label diagnostics through `support/diagnostics.ts`. Diagnostics never include server messages, URLs, error messages/stacks, credentials, or elicitation content. Recovery/fallback behavior otherwise retained. Native expected protocol validation and cancellation still produce their native errors/results.
- Native license retained in `LICENSE.native`.

## Historical extraction handoff

At handoff commit `97c7ad4`, the extraction itself had no test, typecheck, lint or runtime qualification. It performed no installation, activation, settings changes or credential reads. That statement records the extraction stage, not the current package qualification.

The package contains `mcp/tools.ts`, `mcp/resources.ts`, `mcp/ui.ts` and owned render helpers. Their headers retain native source paths, hashes and MIT notices. The default entry exports `createMcpMirrorExtension`, registers the sibling collector and declares peers/runtime dependencies. Current stock dispatch, Codemode and default-entry evidence is in [VERIFICATION.md](../../VERIFICATION.md). Clean staging and package-manager installation remain unverified. Its installed package manifest exports the public pi-ai OAuth page subpath.

Diagnostic additions are intentional observable deviations from native best-effort silence; qualify stderr/warning behavior and cleanup races. The synchronous credential backend intentionally does not implement unrelated native async operations. File permissions and external shell-login interoperability are source-preserved, not platform-tested. No claims of live operation or release readiness.

## Stock-loader adaptation

`packages/ai/src/utils/oauth-page.ts` SHA-256: `a5c0f7ddd7a1a803c8fbaf65adaffb6a7710a70a75b5559a749ba811942fab40`. The public stock-loader test exposed the subpath-alias failure before this local extraction. HTML escaping and response bytes remain native. No installed aliases or host modules were changed.

## Owned corrections and current scope

Mirror-managed logout drains refresh work and deletes credentials under the retained native refresh lock. Captured setup/operation signals invalidate pre-logout retry and detached-reconnect continuations. Needs-auth snapshots distinguish deletion from a later external sign-in. Native formats, lock naming and lost-lease behavior remain unchanged.

Manager/notification text is encoded at the display boundary, including blank-label fallback values and manager callback exceptions. Selected values and protocol payloads remain opaque. The connector assigns resource/template server attribution after remote fields.

Form-capable per-connection serialization, honest extension permission identity and fixed-label diagnostics are intentional differences. The [verification limits](../../VERIFICATION.md#unverified-boundaries) and [accepted auth limitation](../../VERIFICATION.md#accepted-auth-limitation) govern the qualification claim. No live installation, activation or full release qualification is implied.
