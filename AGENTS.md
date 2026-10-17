# AITuning public distribution

These instructions govern work in this checkout. For another project, merge the Tool composition paragraph into its existing instructions and keep that project's policies.

## Tool composition

Prefer direct tools by default, including for compact reads, searches, edits, and batches. Use code mode only when filtering or aggregating intermediate results clearly reduces the data entering context beyond what native tools can already return. Discover current tool schemas before unfamiliar calls. Parallelize independent reads when the runtime supports it; sequence dependencies and mutations. Await every call and report denials, errors, truncation, and partial completion. Preserve the permissions on each underlying action. Return the requested fields and evidence needed to assess the result. Use direct tools for capabilities the bridge cannot preserve. Code mode changes tool composition, not task-model selection or required delegation.

When a task needs substantial tool-result filtering or aggregation, load the optional `code-mode` skill if installed. For setup, exposure choices and measured limits, read [CODE_MODE.md](CODE_MODE.md). Keep the user's model choices, permission prompts, hooks and delegation requirements.

## Work in this checkout

Read the relevant collection README before changing a skill. Preserve complete skill folders, supporting files, licenses and the separation of flowstate, trajectory and knowing. Keep local credentials, provider settings, generated results and client caches outside the package.

Use checks that match the changed files. The optional [evaluation toolkit](evals/README.md) provides local checks when selected. The mod's [development guide](mods/code-mode/README.md#develop-and-verify) names its offline tests. A passing local check does not establish provider access, live permission behavior or automatic skill loading. Obtain authorization for paid model runs and external publication.
