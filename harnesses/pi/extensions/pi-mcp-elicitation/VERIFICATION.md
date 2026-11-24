# Elicitation verification

> Source export only. Exporting does not install, load, or activate this package.
> Reported development test results below are historical observations, not
> qualification of a public installation. Private receipts and host files are omitted.

**Unreleased local source candidate; final source decision complete.** Companion, native compatibility, repository, floor, and manifest checks pass. The owner-authorized reasoning fallback found no blocking source issue; earlier Jev calls remain failed, not approvals. No activation was performed, and no assertion, skip, or threshold was weakened. Historical failures and unverified deployment limits remain below.

## Contents

- [Qualified versions and artifacts](#qualified-versions-and-artifacts)
- [Passing checks](#passing-checks)
- [Historical failed checks](#historical-failed-checks)
- [Windows portability follow-up](#windows-portability-follow-up)
- [Independent source review](#independent-source-review)
- [Evidence locations and limits](#evidence-locations-and-limits)
- [Repository gate follow-up](#repository-gate-follow-up)
- [Repository exporter follow-up](#repository-exporter-follow-up)
- [Single-window TUI follow-up](#single-window-tui-follow-up)

## Qualified versions and artifacts

The original native-source qualification used Pi 1.3.0 at `71023aec1546d6d677a65669c5665c0927ce0dd0`, RPIV 2.13.9, companion 0.1.0, and Node 24.21.0 on Windows. verification.json (private development evidence omitted) retains that qualification's command receipts, exit codes, log hashes, and runtime-file fingerprints. The single-window follow-up below has separate source bindings and receipts.

The native [manifest](upstream/manifest.json) binds all seven patch files. The native checkout and generated qualification files live under private development evidence (omitted). The exported patch excludes generated qualification files, dependencies, model catalog data, and lockfiles.

The data-only hydrator initially fetched a newer model catalog that did not match Pi 1.3.0's test unions. Qualification instead used the installed identical release's generated provider JSON. No tracked model files or type checks were changed to accommodate catalog drift.

## Passing checks

| Check | Observed result | Receipt name |
|---|---|---|
| Entire companion Node test suite, including real installed SDK and RPIV | 24 passed, 0 failed, 0 skipped; exit 0 | `companion-final-v2` |
| Native source patch dry-run, application, repeat application, seven output hashes, refusal of partial edits | 5 passed; exit 0 | `patch-qualification-v2` |
| Upstream `npm run check` | Exit 0; one source file formatted, no type errors or warnings. Includes browser smoke and dependency checks | `native-check-v2` |
| Focused native MCP and qualification suite | 161 passed, 1 existing skip; exit 0 | `native-focused-v2` |
| Real native MCP to companion to RPIV qualification | 4 passed | `native-focused-v2` |
| Shared v1 contract table against both validators | 23 passed, including malformed keyword types and near-byte-limit payloads | `native-focused-v2` |
| Claude marketplace and core-plugin manifest validation | Both passed; exit 0 | `repo-load` |

The real native tests load both extension packages through Pi's resource loader. They do not assign provenance or replace nested execution. They cover false through final acceptance, permission denial without fallback, final decline without content, and native integer fallback preserving zero. The remote MCP server, faux model responses, and UI answers are controlled boundaries.

The shared contract table first failed 12 of 17 cases, then passed after alignment. Re-review added malformed-type and byte-boundary cases. Five additional cases failed before their fixes. A separate coordinator regression failed on 65,535-byte content before collection-envelope accounting was fixed. The final 23-case table and coordinator test pass. The original capability regression also failed on unmodified Pi before implementation.

<a id="blocked-checks"></a>

## Historical failed checks

The isolated broader native sweep ran all matching MCP tests and the complete AgentSession suite, including nested regression files:

```sh
node .scratch/pi-mcp-elicitation/out/isolated-native-tests.mjs "$PI_SOURCE" test/mcp test/suite
```

It finished with **596 passed, 2 failed, 2 existing skips** across 106 files. An earlier run inherited provider configuration and also failed the models hot-reload test. That third failure disappeared in the empty-environment wrapper, matching the isolation used by upstream `test.sh`.

Both remaining failures reproduced on pristine upstream Pi 1.3.0 with the same dependencies and catalog. The pristine and patched comparison runs each reported 8 passed and 2 failed:

- `mcp-command.test.ts` expects POSIX `spawn ... ENOENT` text. Windows returns a command-interpreter error instead.
- `2791-fswatch-error-crash.test.ts` writes a Windows `C:/...` path as an ESM import specifier. Node requires a `file:` URL and exits before testing the watcher.

These files were unchanged in that run. The original broader sweep receipt is `native-isolated-v2`. Raw comparison receipts are named `baseline-failures` and `patched-failures`. The two pre-existing skips remain upstream behavior; this patch adds none.

At that stage, repository `npm test` was not green. That run used the documented native Windows runner and finished with 149 passed and 1 failed in the first 150-test group. The failure is `evals/test/execution.test.mjs` (not bundled): the lost-observer-handle test receives child exit 1 instead of 0. The cause is unverified and outside this feature. Later commands in the `&&` chain do not run. The receipt is `repo-test-native`.

Earlier attempts failed in the floor-guard self-test, then in a Node-launcher expectation. The floor self-test passes in the latest run. The record retains every failed observation alongside later results.

The separate floor guard at that stage against `HEAD` exited 1 with 6 findings in unrelated private development evidence (omitted) prototype files. It reports none in this feature. The earlier floor run reported 79 findings. Concurrent changes to the evaluator explain the need for a fresh run, but this task did not repair or weaken it.

Independent checks pass: the global instruction sync check reports 15 matching files; skill validation reports 72 skills with 0 errors and 5 unrelated size warnings; trigger routing reports 90.8% rank-1 over 217 positives with no failures. Those independent checks did not make that failed full-repository gate green. No size baseline was updated.

## Windows portability follow-up

The owner authorized repairs to the two tests in isolated Pi 1.3.0 checkouts. The separate portability patch (private development evidence omitted) changes no production code, dependency declaration, lockfile, skip or suppression. The original seven-file form patch is unchanged.

| Receipt | Observation |
|---|---|
| `windows-red-baseline-v1` / `windows-red-pi-v1` | Each reproduced both original failures: 7 passed, 2 failed. |
| `windows-green-baseline-v3` / `windows-green-pi-v2` | Both focused profiles passed all 9 tests after local TUI build prerequisites were present. |
| `windows-watcher-mutation-v1` | Expected failure after removing the child's error listener: the actual emitted error was unhandled and threw. Import and watcher setup had succeeded. |
| `windows-check-baseline-v2` / `windows-check-clean-patched-v2` | Original upstream `npm run check` passed, including types, dependencies, browser smoke and formatting with no fixes. |
| `windows-broad-baseline-v2` | Full selected `test/mcp test/suite` profile: 517 passed, zero failed, 2 existing skips across 102 files. |
| `windows-broad-clean-patched-v2` | Same full selection with the form patch and original feature fixtures: 598 passed, zero failed, 2 existing skips across 106 files. |
| `windows-portability-artifact-v1` / `windows-form-patch-artifact-v1` | Test-patch apply/reverse/restoration: 4 passed. Original form-patch qualification: 5 passed. |
| `windows-companion-v1` / `windows-integrity-v1` | Companion: all 24 passed. Source/runtime hashes, links, UTF-8/LF and native whitespace checks passed. |
| `windows-prose-v1` / `windows-floor-v1` / `windows-load-v1` | Prose, full floor guard and plugin manifest validation passed. |

The two existing Windows skips are stdio tilde expansion in `mcp-extension.test.ts` and file-link discovery in `7497-session-discovery-symlink.test.ts`. No skip was added. This is the complete selected MCP and AgentSession profile, not the entire monorepo test suite.

The missing-command test retains the exact POSIX diagnostic. Its Windows assertion requires the failed server, exact command, closed connection and actual English command-not-recognized stderr. A new broken-only exit-1 check prevents invalid configuration from masking a connection exit-code bug. The healthy-only exit-0 control remains. The watcher uses a `file:` import URL and serialized literals without changing its actual watcher/error/exit assertions.

Failed intermediate receipts remain. The first URL repair exposed missing compiled TUI output. The old baseline shared a dependency junction into the patched checkout, so both local TUI builds were needed before rerunning it. The old patched checkout also contained mirror-only generated fixtures that failed native TypeScript checking. No native tests were removed to hide that failure: a fresh detached `windows-native-v1` worktree at the pinned commit received the exact form patch, portability patch and original companion-generated fixtures. All 106 files and 600 cases from the original selected patched profile remain represented.

Fresh-worktree checks then exposed missing workspace-local dependencies: the AI workspace requires OpenAI 7.19.0, not the unrelated root transitive 6.40.0. Reusing the existing declared workspace dependencies resolved those setup errors. No dependency installation, provider call or credential access was performed. Node 24.21.0 ran the native checks; the outer receipt runner used Node 24.19.0.

The mutation fixture was moved out of test discovery after the expected negative run; its bytes and failed receipt remain local evidence. Independent read-only review `2f9b7e68` found no Critical or Important issue in the bounded patch and tests. English Windows diagnostics were qualified. POSIX execution, other Windows locales, clean dependency installation, installed behavior and release remain unverified.

## Independent source review

The initial standards and spec reviews found validator drift and missing proof of the full native path. Shared real-validator cases and the real AgentSession fixture addressed those findings. The final scoped review also closed malformed-keyword and envelope-budget findings. The security reviews reported no verified Critical or Important vulnerability in the reviewed changes.

These are source and artifact reviews, not deployment qualification. The final review found no open Critical or Important issue in the scoped fixes. Those original reviews did not waive broader failures. The Windows follow-up above records their local resolution.

## Evidence locations and limits

Each receipt name above identifies private development evidence (omitted), with adjacent complete `stdout.log` and `stderr.log`. These local logs are not shipped as extension runtime assets. Their hashes and receipts are retained in verification.json (private development evidence omitted).

Terminal rendering in a real interactive session, a live RPC client, a rebuilt distributable, future Pi versions, and future RPIV versions are not qualified here. Tests use in-memory or temporary configuration and fake credentials, make no real model calls, and do not alter the installed Pi release or live settings. Native MCP remains under the owner's control.

## Repository gate follow-up

Separate full repository reruns passed during mirror qualification: canonical `npm test` in `evals/`, the full floor guard against `db51e348176a2c2f45c2bb571e5b942a0c27ffaf`, manifest validation and check-only global sync. The [mirror verification record](../pi-mcp-mirror/VERIFICATION.md#qualified-checks) links their retained receipts. This feature did not change unrelated tests or thresholds.

This is fresh repository-gate evidence, not an inference from mirror package tests. Those repository reruns did not resolve the native Windows failures. The later portability follow-up records the native reruns separately. Neither follow-up replaces historical receipts, authorizes activation or qualifies a release.

<a id="current-repository-blocker"></a>

## Repository exporter follow-up

The earlier `windows-repository-v1` canonical `npm test` exited 1. Its preceding Node groups passed 167, 6 and 22 tests. The publication Python suite then passed 15 of 16 cases. `test_default_prepare_runs_the_real_current_exporter` in private development evidence (omitted) failed when its preparation reported `node operation failed (exit 1)`.

The failing lean fixture selected neither MCP package nor the isolated Pi checkouts. On follow-up, the shared tree already included the required continuation `src/input.mjs` and current exporter modules/templates. No publication implementation edits were needed or made here. The continuation entry imports `input.mjs`, and the closed lean export requires it. Omitting only that fixture input reproduced the original CLI failure in disposable local repositories.

| Receipt | Observation |
|---|---|
| `publication-current-focused-v1` | The original failing method passed: 1 test, zero failures. |
| `publication-omit-input-v1` | Expected negative probe: omitting only `src/input.mjs` reproduced the original node-operation exit-1 failure. Shared sources were untouched. |
| `publication-repository-v2` | Unchanged canonical `npm test` exited 0. Reported Node groups passed 167, 6 and 22 tests; all 21 publication Python cases passed. |
| `publication-load-v2` / `publication-floor-v1` | Manifest validation and the full floor guard passed. |

Read-only review `0f9e91de` found no Critical or Important issue in the bounded fixture-input fix. Its verdict covers current source inspection, not an independent test rerun or the separate expanded-publication feature. The original failed receipts remain. No assertion was removed or weakened, and no failing gate was waived.

The support-module update preceded the canonical run. Receipt and input metadata retain that chronology. Repository tests retained five unrelated skill-size warnings, expected planted cleanup diagnostics and 15 reference cases without LLM graders. Manifest validation retained install-line advice. No size baseline changed.

These observations resolve the publication blocker for the local native-source qualification. The selected native profile, existing Windows skips, version pins and unverified deployment/release limits above still apply. No installed Pi, live settings, real publication destination or package activation was changed.

## Single-window TUI follow-up

The follow-up uses the installed Pi 1.3.0 SDK and real TUI components. Its selected acceptance boundaries are the registered companion tool and the component's rendering, keyboard, mouse, and focus APIs. No new native end-to-end case was added.

The default TUI presents the request, editable fields, and explicit Send response / Decline request / Cancel actions together. RPC and explicitly selected RPIV or adapters retain their compatibility path. Server descriptions of access and lifetime remain untrusted data, not promises made by the companion.

Receipts are under private development evidence (omitted):

| Receipt | Observation |
|---|---|
| `affected-final` | Complete six-file companion suite: 46 passed, zero failures or skips. Includes eight registered-SDK cases and eighteen real-component UI cases. |
| `native-prepare-final` | Regenerated the two owned qualification fixtures in the existing isolated Pi source checkout. |
| `native-legacy-final` | Original four native wire/gate cases and twenty-three shared validator cases: 27 passed, zero failures or skips. |
| `repository-final` | Canonical `npm test` in `evals/` exited 0. Node groups passed 167, 6, and 22 tests; the publication Python suite passed 21. |
| `floor-final` | Full guard against `HEAD`: clean, no findings, exit 0. |
| `load-final` | Marketplace and core-plugin manifest validation passed, exit 0. Install-line advice remains. |

The native fixture now selects `rpiv` explicitly because it qualifies the legacy collector chain. Its original nested-parent, permission-denial, false/zero, final-consent, and wire assertions remain intact. The new default form is verified at the selected registered-tool and TUI boundaries, not by those legacy wire cases.

Red-before-green receipts preserve the row-budget failure, mouse-hover accidental send, trapped refusal, uninitialised paging offset, adapter-name collision, optional-editor navigation trap, clipped enum value, and blind submission below twelve rows. The fixes keep all decisions in the same window. A test-only undefined Escape token also failed before correction; that observation remains recorded.

Independent review `fcf6ab45` reports no open Important or Critical finding in the final inspected source. It closed the adapter-name, optional-editor, and full-value-inspection findings. This is source review, not an independent test rerun. The fleet display omitted the report; its complete final text was recovered from the run's persisted assistant message without exposing reasoning text.

The canonical policy check reports the live Pi policy as `same`, resolving the earlier drift blocker. This follow-up did not write that policy or change access rules. Expected planted cleanup diagnostics, Authlib deprecations, five unrelated skill-size warnings, and fifteen reference cases without LLM graders remain in the repository logs.

`source-binding.json`, `review-final.md`, and `documentation-ledger.json` in the receipt area retain the inspected inputs, review, and documentation accounting. Earlier receipt directories are retained, including failed probes.

No installed Pi host, live settings, directory grants, or native patch files were changed. Real-terminal rendering, a live RPC client, deployment, and a rebuilt distributable remain unverified.

### Final source decision

The full final Jev input was rejected with `hosted_context_budget` before provider selection. A bounded, explicitly excerpt-based correction kept the same claims and thresholds, reached TypeSafe, and returned HTTP 200 with `invalid_response`. Neither call produced a judgment or automatic approval. The two request/result pairs are retained as `jev-window-final.*.json` and `jev-window-compact.*.json` in the receipt area.

The owner subsequently authorized the ordered decision fallback. Complete source context is outside the local profile's qualified bounds; the unchanged Jev attempts above supplied no usable judgment. Native review `48e4d7b8`, requested as `gpt-6-luna` at `high`, found no blocking source issue and no Critical, Important, or Minor source finding. The assistant record reports `gpt-6-luna`; backend effort was not exposed. This is the fallback model's decision, not a successful Jev result.

The current decision record and final review text are private development evidence (omitted) and `luna-high-review.txt`. All ten previously bound source, test, declaration, and fixture hashes still match, so the 46-test companion and 27-test native compatibility results remain applicable. The original source binding and failed request/result pairs remain unchanged historical records. Tasks #9 and #8 no longer require provider maintenance; no provider configuration, access rule, grant, or live host was changed to obtain this decision. Real-terminal, live-RPC, and deployment qualification remain outside this source decision.

## Pi 1.4.0 qualification, 2026-10-22

The full companion suite passes 52 tests with 0 failures and 0 skips against installed Pi 1.4.0 and RPIV 2.13.9. The receipt (private development evidence omitted) records Node 24.19.0 execution with isolated synthetic profiles. Startup recognizes Pi 1.3.0 and 1.4.0; unknown versions still warn and load. The mirror's [qualification record](../pi-mcp-mirror/VERIFICATION.md#pi-140-qualification-2026-10-22) covers 28 integration tests and the runtime repairs.

The existing native patch's seven exact source hashes match official Pi `v1.4.0`, commit `4a080252f06caf63a525d7873c5d94d3c23887e0`. In a disposable checkout, preflight (private development evidence omitted), application (private development evidence omitted) and idempotent reapplication (private development evidence omitted) all exit 0. The original manifest and patch remain unchanged. This establishes source applicability; runtime coverage uses the mirror, and no upstream monorepo suite or installed native patch is claimed.
