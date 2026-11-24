---
name: release
description: "Prepare a release of integrated work: pre-release checks, a semantic version, the changelog, an annotated tag, a rollback plan, and verification after deploying."
disable-model-invocation: true
---

# Release

Turn integrated work into a versioned release that consumers can trust and you can undo. This skill prepares, versions, tags, and verifies; the deploy itself uses whatever your platform does.

## 1. Pre-release checks

With evidence, as the `evidence` skill describes, and against its full Definition of Done:

- The full test suite, build, and typecheck pass on the commit being released.
- A full `audit` of the changes since the last release has no open Critical or Important findings, and the floor guard is clean.
- **Migrations**: every migration's down path has been **tested**, and destructive schema steps (drops, renames) ship in **their own release**, after no deployed code depends on the old shape.
- New configuration and environment variables are documented, with safe defaults or clear failure messages.

Stop and report anything that fails.

## 2. Version

Choose `MAJOR.MINOR.PATCH` by **what consumers can observe**, not by diff size:

- **MAJOR**: a consumer must change to upgrade (a removed or retyped field, a changed behaviour they relied on, even an undocumented one).
- **MINOR**: new, backward-compatible functionality.
- **PATCH**: a backward-compatible fix.

When unsure whether a change is breaking, treat it as breaking: a surprise major is far cheaper than a broken consumer. Breaking changes get a migration note and, where possible, a deprecation window first. Confirm the version with the user.

## 3. Changelog

If the project keeps a `CHANGELOG`, entries should already exist from each change (the `build` skill adds them); curate them into the release section, newest on top, grouped as **Added / Changed / Fixed / Deprecated / Removed / Security**, each phrased by its impact on users. A changelog is not the commit log. If the project keeps none, offer to start one.

## 4. Tag

Create an **annotated tag** on the release commit (`git tag -a vX.Y.Z -m "Release X.Y.Z"`) and push it after the user confirms. If the project records its version in a file (a manifest), set it once in the release commit before tagging, so the artifact, tag, and changelog agree.

## 5. Rollback plan

Before deploying, write down:

- **Baseline**: the current error rate and p50/p95 latency, read from the dashboards before deploying.
- **Triggers**: what signals a rollback, each as a number against the baseline (error rate above twice the baseline, p95 up more than 20%), plus any specific user-facing failure.
- **Steps**: turn off the flag, or redeploy the previous tag.
- **Database**: which migrations have down paths, and what happens to data written by the new version.
- **Time to roll back**, so everyone knows how fast the exit is.

## 6. After deploying

Use [Capabilities and deltas](../spec/CAPABILITIES.md) to update deployment evidence for the capabilities actually verified in this release. Keep source/integration evidence distinct from runtime or production observations; do not promote every planned Delta entry with the version tag. A removal or rename needs its own consumer/migration verification.

Watch a fixed window after deploying (30 minutes, or each canary step) and compare against the baseline. Verify with evidence: the health check responds, no new error types appear, latency hasn't regressed, the critical user flow works, logs are flowing, and the rollback path is ready. Report the release: version, tag, changelog section, the rollback plan, and the verification results.
