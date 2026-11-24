# Verification cadence and reusable evidence

Use this contract for implementation, review fixes and integration. Project instructions, explicit Verify commands and required CI checks take precedence. This default avoids duplicate work; it never waives a required gate or changes its scope.

## During development

- Keep red-before-green: observe the relevant regression test fail for the intended reason, then pass with the fix. Retain both results.
- After a meaningful change, run the focused test or affected checks that can expose its failure. Batch independent checks only when they share no mutable fixtures, outputs or services.
- Do not rerun an identical check merely because a skill loaded, a commit was made, a reviewer took over or a status report is due. Check evidence validity instead.
- After each review fix, run its focused regression check. Run broader checks immediately when the impact is uncertain, a shared seam changes or project policy requires them.

## At delivery

After the last relevant fix, require the ticket's Verify commands, full suite, typecheck and every applicable project gate. A command already proved on the same relevant inputs can satisfy overlapping requirements once. Preserve the independent review and floor guard. A reviewer checks the implementation and receipts independently; independence does not require repeating valid commands.

For a multi-ticket feature, check the combined result and cross-ticket acceptance criteria. For integration, check the actual merged result, including conflict resolutions. Evidence from an isolated worktree does not prove an integration with different inputs. Run any gate explicitly required on the merged result or by CI, even if local evidence exists.

## When evidence can be reused

Use evidence from this task only when its relevant inputs and execution conditions are demonstrably equivalent. A commit ID alone is not a fingerprint of uncommitted or untracked inputs. Consider:

- Source, tests, fixtures, snapshots, generated files and the files the command discovers.
- The command, arguments, test selection, configuration, dependencies and lockfiles.
- Runtime, compiler and tool versions, platform, environment variables and permissions.
- Services, data, external state and any time-sensitive preconditions.
- Acceptance criteria and the scope of the claim.

A change invalidates every check that depends on it, not automatically every unrelated check. A documentation-only edit may leave code-test evidence valid; a lockfile or runner change may invalidate the whole suite. If equivalence or impact is unknown, rerun the affected check. A project-mandated fresh run is never replaced by an equivalence argument.

## Keep a receipt, not a claim

Attach the exact command, working directory, relevant state/input identifiers, toolchain and environment, time, exit code, pass/fail counts and output or log path. Name which requirement it proves and why reused evidence still applies. Preserve failed observations and red-before-green evidence alongside later passing runs. Report missing or invalidated checks as unverified, not passed.

Failure stops the claim it supports. Diagnose it; do not retry blindly, weaken assertions, add skips or suppressions, lower thresholds or silently narrow coverage to get green. Use the project's flake policy for an infrastructure retry, retaining both outputs.
