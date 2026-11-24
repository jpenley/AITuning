# MCP mirror verification

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

This is the authoritative local qualification record for the unreleased mirror. It records synthetic observations, not an installed or deployed capability. verification.json (private development evidence omitted) binds commands, receipts and source hashes. Logs remain under private development evidence (omitted) and are not included in the package.

## Contents

- [Approval-deadline source change](#approval-deadline-source-change-2026-10-27)
- [Qualified checks](#qualified-checks)
- [CLI disable follow-up](#cli-disable-follow-up)
- [Acceptance matrix](#acceptance-matrix)
- [Regression history](#regression-history)
- [Review scope](#review-scope)
- [Accepted auth limitation](#accepted-auth-limitation)
- [Unverified boundaries](#unverified-boundaries)
- [Reproduce local checks](#reproduce-local-checks)
- [Pi 1.4.0 qualification](#pi-140-qualification-2026-10-22)

## Approval-deadline source change, 2026-10-27

Activated on 2026-10-27 by copying the reviewed worktree change into the main checkout, which Pi's settings already load as a package (commit `c06737c4`). No settings, installed Pi files or permission rules changed. After activation the stock suite in this checkout passed 39/39 (0 failed, cancelled or skipped) against Pi 1.4.0 and RPIV 2.15.0, and the typecheck exited 0.

Live check, 2026-10-27: a fresh Pi 1.4.0 session started after the ai-tools `5cb08b8` deployment called `request_directory_access` for a Temp folder outside the project. The form stayed open from about 21:14:31 to 21:25:37 local time (about 11 minutes, past both the old 60-second client and 120-second server limits). The owner set the field to true and chose Send response; the tool returned `granted`, and `write_file` then created the file in that folder. One window does not prove indefinite reliability. The experiment report (private development evidence omitted) and receipts (private development evidence omitted) own the current observations. Historical qualification below stays attached to its recorded inputs.

The original MCP 1.4.0 request timer rejected a real in-memory `tools/call` during a simulated two-day human wait: one test, one failure. The new adapter passed 11/11 tests against each public MCP client, 1.3.0 and 1.4.0. Tests cover waiting, cancellation, remaining budgets, progress, nested waits, collector failure, shutdown, per-request options and separate connections. Strict typechecking passed with explicit read-only aliases; an earlier alias-incomplete check failed and remains in the receipts. The canonical source check then exposed missing JavaScript inference for a regular companion copy inside `node_modules`. The check now resolves the declared adjacent companion's public exports, without ignoring errors, and passed with the locked MCP 1.3.0 declarations and selected Pi 1.4.0 peers. This is a source-workspace check, not packed-artifact qualification.

An excerpt-only adversarial reviewer accepted the source change with no actionable finding. That review did not execute tests or inspect an actual window. The first broader SDK run passed 16/39 tests and failed 23 package-load checks because the worktree lacked its declared companion dependency. After explicit owner consent, the assistant prepared the dependency workspace by copying matching installed package versions through MCP, without package hooks, downloads, links or an extra Pi SDK. The unchanged offline SDK suite then passed 39/39 tests (including the 11 client tests), with zero failures, cancellations or skips. It retained two fixed reconnect warnings and the RPIV 2.15.0 compatibility notice; it did not exercise an actual approval window.

The source tests alone did not establish the active connector's complete call chain or remove a server-side deadline; the live check above covers one installed flow with the redeployed server. Per-connection serialization remains, and cancellation or session invalidation may still end a pending form. This adapter imposes no fixed human deadline; silence never grants permission. The owner approved activation on 2026-10-27.

## Qualified checks

Initial qualification observed on 2026-10-19: Windows x64, Node 24.19.0, Pi 1.3.0 and RPIV 2.13.9. TypeScript is pinned in the manifest; native-derived checks used Vitest 4.1.11.

| Receipt under the evidence directory | Observation |
| --- | --- |
| `stock-full-final-v1` | 21 passed, zero failed or skipped. Includes actual default entry, protected built-in provenance, native ordinary-behavior comparison, hook/parent chains, consent/cancel, print mode, auth snapshots, notifications, resources and qualifier isolation. |
| `typecheck-final-v1` | Exit 0, empty stdout and stderr. Includes the structural public credential-store consumer fixture. |
| `native-owned-final-v1` | 97 passed, zero failed, one existing upstream Windows-only skip across eight files. The skip is stdio tilde expansion in `mcp-extension.test.ts`; no skip was added. |
| `shared-mirror-final-v1` | Four shared real-host/RPIV elicitation cases passed against owned mirror modules. |
| `shared-native-final-v1` | The same four cases passed against the pinned patched-native bridge. This is not pristine native form support. |
| `companion-final-v1` | All 24 companion Node tests passed, zero failed or skipped. |
| `repository-final-v1` | Canonical `npm test` in `evals/` exited 0. Includes 167 primary Node tests, later suites/selftests, structural validation and trigger checks. |
| `sync-final-v1` | Check-only exit 0; 16 owned global instruction/helper files matched. No apply. |
| `plugin-load-final-v1` | Marketplace and skill plugin manifest validation exited 0. No install or model call. |

The separate full floor guard and whitespace check both exited 0 against baseline `db51e348176a2c2f45c2bb571e5b942a0c27ffaf`. verification.json (private development evidence omitted) retains their receipts and hashes. These full-gate reruns, not package success alone, clear the earlier repository-gate blocker. At that stage, native-patch Windows failures remained separate. The [later native portability follow-up](../pi-mcp-elicitation/VERIFICATION.md#windows-portability-follow-up) records their local resolution with a test-only patch.

The native-derived run emitted fixed-label warnings for failed connection attempts during sign-out/shutdown. Repository tests emitted expected planted cleanup diagnostics and five skill-size warnings. Plugin validation emitted README install-line advisories. The receipts retain those outputs without treating warnings as silent success.

## CLI disable follow-up

The mirror now honors a parsed `--no-mcp` before registering its collector or connector. Pi's public parser preserves the `--` separator and option-value semantics. The [disable guide](ACTIVATION.md#disable-controls) states the process-global SDK boundary and separate native fallback control.

| Receipt | Observation |
| --- | --- |
| `no-mcp-red-v1` | Behavioral red: three passed, one failed because `/mcp` still had one owner when zero were required. |
| `no-mcp-green-v2` | Four default-entry cases passed: enabled, disabled with reload, token after `--`, and token consumed as an option value. Disabled checks assert no mirror commands, tools, hooks, fixture process or UI effects. Enabled cases retain stdio, consent, provenance, Codemode and discovery assertions. |
| `no-mcp-stock-v1` | All 24 stock-host tests passed, zero failed or skipped. |
| `no-mcp-typecheck-v1` | Exit 0; no compiler output. |
| `no-mcp-repository-v1` / `no-mcp-load-v1` | Full repository test chain, check-only global sync and plugin validation exited 0. |
| `no-mcp-floor-v1` | Full floor guard exited 0 against the same baseline. |

`no-mcp-green-v1` retains a failed test assumption: `getAllTools()` includes inactive native tools. The corrected assertion excludes MCP tools while allowing ordinary native tools. Command, hook, reload and peer-start assertions were retained. No production workaround, skip or suppression was added.

Final read-only review `e684e36f` found no confirmed Critical/Important defect in the entry guard, regression design and loading docs. Its final text was recovered from the persisted assistant message after the fleet summary omitted it. The reviewer did not independently rerun tests or review the existing connector. This is not a full security verdict.

The checked runtime/test fingerprint remained unchanged through the broad runs. The runner launched independent checks concurrently despite requested ordering; their complete receipts were inspected. Stock tests emitted two expected reconnect warnings. Repository selftests retained cleanup diagnostics, five skill-size warnings and 15 reference cases without LLM graders. Plugin validation retained install-line advice. No installation, activation, live CLI or real-provider check was performed. Historical native-derived, shared and companion checks above were not rerun for this entry-only change.

## Acceptance matrix

The approved specification (private development evidence omitted) owns M1-M10. Each row states the evidence boundary, not literal parity with every native deployment.

| ID | Local implementation and qualification | Limit |
| --- | --- | --- |
| M1 | Actual default entry loads through the stock public SDK/loader, using fake stdio and isolated config. | No installation, activation, live settings or credential test. |
| M2 | Stock tests assert one mirror connector and honest non-built-in provenance. Codemode and `tool_search` retain protected built-in ownership. | SDK construction is explicit; native shell commands are not replaced. |
| M3 | Ordinary-native differential and native-derived extension tests cover names, aliases, schemas, exposure, discovery and readiness. | New form capability and source identity are intentional differences. |
| M4 | Real AgentSession/Codemode dispatch tests observe permission/result hooks, parent chains, progress, cancellation and script results/errors. | Provider and UI responses are synthetic. |
| M5 | Native config/store tests and stock lifecycle/resource tests cover trust, registrations, withdrawal and cleanup. Logout/backoff/teardown regressions reject stale reconnect work. | Tool calls do not retry on transient HTTP errors. Native unknown-session recovery is retained; other deployments are unverified. |
| M6 | Native auth format, store and loopback OAuth tests plus public stock auth regressions pass with synthetic grants. External sign-in remains a positive control. | Intact cooperating locks only; native CLI, real providers and lost leases are outside the guarantee. |
| M7 | Companion, stock and shared patched-native cases exercise strict schemas/results, conditional capability, RPIV/native selection and separate final consent. | Other ask-user tools require the public adapter contract. No URL elicitation or durable approval. |
| M8 | Pristine stock native is the ordinary-behavior oracle; the patched-native bridge is the form oracle. Shared fixtures use the real host harness and RPIV. | The stock CodeMode/public-loader checks are separate from the shared native-source contract profile. Neither profile is a replacement dispatch mock. |
| M9 | Source pin, hashes, per-file notices, native license and explicit peers/runtime dependencies are recorded. | A clean staging install and dependency advisory audit are unverified. |
| M10 | Loading, disable controls, SDK/native CLI differences, source-sensitive permissions, update procedure and limits are documented. | No live CLI activation or release approval follows from documentation. |

## Regression history

Failed receipts remain inspectable. A setup/transform failure is not counted as a behavioral red.

| Regression | Behavioral red | Relevant green |
| --- | --- | --- |
| Delayed OAuth refresh recreates credentials after logout | `logout-red-v1` | `logout-green-v1`; stock full suite repeats current auth cases. |
| Retry backoff opens another transport after logout starts | `retry-red-v2`, transport count 2 rather than 1 | `retry-green-v1`; `native-owned-final-v1` repeats it. |
| Detached reconnect teardown outlives completed logout | `teardown-red-v1`, transport count 2 rather than 1 | `teardown-green-v1`, 3/3; native full run repeats it. |
| Existing needs-auth snapshot mistakes deletion for sign-in | `snapshot-red-v3`, three transport attempts rather than two | `snapshot-green-v1`, 3/3; stock full run repeats it. |
| Manager text contains terminal controls | `terminal-red-v1` | `terminal-green-v1`; native full run repeats the display cases. |
| Connection-error notification carries raw OSC/CSI/bidi | `notification-red-v1` | `notification-green-v1`; stock full run repeats it. |
| Blank label displays an unsanitized opaque value | `fallback-label-red-v2` | `fallback-label-green-v1`; selection identity stays opaque and unchanged. |
| Manager callback exception bypasses notification encoding | `manager-exception-red-v1` | `manager-exception-green-v1`, 5/5; native full run repeats it. A real remote producer was not established. |
| Resource/template fields forge connector-owned server attribution | `resources-red-v1` | The explicit spoof case passes in `stock-full-final-v1`. |

`snapshot-red-v2` passed, but its fixture was not a valid refutation. The corrected fixture parses the seed, verifies real needs-auth state and runs the post-turn observation. Its behavioral red and green supersede that invalid inference, not the saved receipt.

`stock-native-red-v1` recorded four passes and eight failures at the expected missing form-capability assertion. It proves the native feature is absent there. It does not prove the later native consent/cancellation assertions independently ran.

## Review scope

The exported structural interface and public consumer typecheck address the original standards review's Important nominal credential-injection concern. The original spec review found no confirmed Critical/Important runtime defect in its snapshot; it noted minor API/diagnostic differences.

OpenAI review `f4823cd9` was not clean: two Important findings and one Minor. Its native stale-lock finding became the owner-approved R1 limitation, not a claim of remediation. Later regressions corrected the pending-reconnect and stale-snapshot paths.

OpenAI follow-up `e15997b2` confirmed the named corrections but found an Important detached-close reconnect gap. The new behavioral red reproduced it. `63beb26f` then found no confirmed Critical/Important finding in the bounded lifetime/exception fix review. It did not audit the entire package, dependencies or deployment.

Claude review `e98a69d1` stopped with `CLAUDE_SUBSCRIPTION_STOPPED` and supplied no verdict. A regression-quality run, `f225a879`, completed without recorded final output; it is not counted as a review verdict. No clean cross-model security review is claimed.

## Accepted auth limitation

The owner retains native auth formats and locking. Logout drains current refresh work, deletes under the native-compatible refresh lock and invalidates older setup/operation lifetimes. This is a cooperating-writer guarantee with intact leases.

A suspended process can lose its stale lease, resume after another session logs out and recreate credentials. The mirror adds no fencing metadata or alternate credential registry. Native CLI writers that do not join the logout transaction, overlapping explicit sign-in and remote bearer revocation remain outside the guarantee.

The fixes do not repair the installed native release or shell-level `pi mcp` behavior. Do not call logout unconditionally cross-process safe.

## Unverified boundaries

- Fresh dependency staging, packed/published artifacts, Pi package-manager install/uninstall and persistent extension registration.
- Other Pi/RPIV versions, other ask-user extensions without a qualified adapter, and automatic compatibility after updates.
- Real MCP/OAuth services, provider-backed credential lookup, real browser sign-in, native CLI auth interoperability and cross-process lost-lease revocation.
- Live terminal or RPC clients and human interaction. Tests drive real components and public contexts with scripted responses.
- Linux/macOS behavior, POSIX mode enforcement and Windows ACL guarantees. Source-preserved create modes do not establish OS permission parity.
- Same-server parallel throughput. Form-capable connections serialize operations; different connections can proceed concurrently.
- Unicode confusables, LF layout spoofing and oversized display content. The named manager/notification fields encode specified terminal and bidi controls; this is not a whole-host renderer audit.
- A complete dependency advisory/supply-chain audit, full security review or release approval.

Earlier native-patch/upstream verification remains separate. Both pristine and patched Pi source had Windows portability failures in `mcp-command.test.ts` and `2791-fswatch-error-crash.test.ts`. The mirror checks neither fixed nor waived those failures. A later owner-authorized test-only repair and full selected native rerun resolved them locally; see the [companion verification record](../pi-mcp-elicitation/VERIFICATION.md#windows-portability-follow-up).

## Reproduce local checks

Provide public `SDK_ROOT` and `RPIV_ROOT` package paths, matching the qualified versions. Prepare declared dependencies and public peers locally without modifying the installed release. Then run from the repository root:

```sh
node harnesses/pi/extensions/pi-mcp-mirror/scripts/run-stock-qualification.mjs
```

That command discovers every checked-in `*.test.mjs` in the mirror test directory. It refuses absent/mismatched package roots. It inherits OS execution paths and selected public resource paths only. Homes, config, npm and JITI caches are synthetic and removed after the child exits. The isolation test observes that behavior.

The typecheck entry is `npm run typecheck` in this package. The recorded compiler command is available in private development evidence (omitted). Public peers must be resolvable through the local paths declared in `tsconfig.json`.

For native-source qualification, run `scripts/prepare-native-qualification.mjs PATCHED_PI_CHECKOUT RPIV_ROOT OUT_DIR`. It accepts only the pinned patched Pi 1.3.0 sources. Use `scripts/run-native-qualification.mjs PI_CHECKOUT --config CONFIG TEST_FILES...` with the generated mirror or oracle config. Exact file selections are retained in the machine record. Empty matches or any nonzero exit fail the check.

All MCP/OAuth peers and grants in qualification are synthetic. Memory transports, fake stdio and local loopback tests exercise boundaries without real services. The offline environment is test hygiene, not a security sandbox for installed extensions.

The native follow-up resolved the two Windows test failures locally. A later publication self-test failure was resolved by verifying the existing shared-tree fixture fix and rerunning the unchanged canonical repository gate. See the [repository exporter follow-up](../pi-mcp-elicitation/VERIFICATION.md#repository-exporter-follow-up). Failed receipts remain historical evidence, not waived checks.

## Pi 1.4.0 qualification, 2026-10-22

Installed Pi 1.4.0 and RPIV 2.13.9 passed the following local checks on Node 24.19.0, Windows x64. All profiles, grants and remote peers were synthetic. No installed Pi files or live settings were edited.

| Check | Result | Receipt |
| --- | --- | --- |
| `scripts/run-stock-qualification.mjs` | 28 passed, 0 failed, 0 skipped | stock (private development evidence omitted) |
| Full companion suite | 52 passed, 0 failed, 0 skipped | companion (private development evidence omitted) |
| Existing logout concurrency fixtures | 3 passed, 0 failed | concurrency (private development evidence omitted) |
| `scripts/typecheck.mjs`, `SDK_ROOT` selecting installed 1.4.0 | Exit 0 | types (private development evidence omitted) |

The baseline stock run had 15 failures out of 27 tests. The mirror runtime omitted its elicitation scopes and capability advertisement, and retained an obsolete logout implementation. The repair restores the checked-in native elicitation integration, serializes logout, waits for refresh settlement, deletes under the refresh lock and invalidates older reconnects. Existing consent, provenance and cancellation assertions pass. Legacy RPIV fixtures now explicitly select RPIV; companion SDK tests exercise the default form UI.

The typecheck resolves peer declarations from `SDK_ROOT`, including actual Pi 1.4.0 declarations, instead of silently using local 1.3.0 peers. Windows Git isolation now uses an owned empty configuration file because Git rejects Node's device spelling for the null file.

Failed sandbox receipts remain under `mcp-baseline`, `mcp-fixed-01`, `mcp-companion-14-01`, `mcp-companion-14-02` and `mcp-concurrency-14-01`. Successful reruns needed access to disposable fixture Git configuration and atomic rename operations denied by the sandbox. They made no requests to real providers or external MCP services.

The companion's native source patch also passed exact hash preflight, application and idempotent reapplication on official tag `v1.4.0`, commit `4a080252f06caf63a525d7873c5d94d3c23887e0`, in an isolated checkout. The seven patched files matched the historical patch hashes. This verifies source applicability; the installed-runtime checks above exercise the mirror. No upstream monorepo suite or deployment is claimed.
