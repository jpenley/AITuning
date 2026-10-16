# Definition of Done

A standing bar for implementation changes, applied to the artifacts and delivery phase being changed. Operations and text-only work use the task-specific checks in [Evidence](SKILL.md#choose-checks-for-the-task). Acceptance criteria ask "did we build *this thing*?"; the Definition of Done asks "is it *ready*?". Work is done only when both hold. A project tailors this once (the setup pack's `setup` skill writes `docs/agents/definition-of-done.md`) and then reuses it unchanged; a bar renegotiated under deadline pressure isn't one.

## Correctness

- [ ] Every acceptance criterion is met.
- [ ] The behaviour was verified by running it, not only by compiling or typechecking.
- [ ] New behaviour is covered by tests that fail without the change and pass with it.
- [ ] Existing tests pass: no regressions.
- [ ] Edge cases and error paths are handled, not just the happy path.

## Quality

- [ ] Names and structure reveal intent; comments explain *why*, not *what*.
- [ ] No duplicated business logic.
- [ ] The change adds no dead code, debug output, or commented-out blocks; dead code that was already there is listed, not deleted.
- [ ] Changes are scoped to the work; anything else is on a "Noticed, not touched" list.
- [ ] Lint and formatting pass.
- [ ] The floor guard is clean, and the audit has no open Critical or Important findings.

## Integration

- [ ] The change works with the rest of the system, not only in isolation.
- [ ] Migrations (with tested down paths), configuration, and feature flags are accounted for.
- [ ] Backward compatibility is considered for any public interface; breaking changes are named.

## Documentation

- [ ] Public interfaces, APIs, and user-facing behaviour are documented.
- [ ] Decisions worth preserving are recorded (ADRs, via the `domain` skill).
- [ ] Docs describe the current state in timeless language, not the history of the change.

## Ship-readiness

- [ ] Security reviewed wherever the change touches a trust boundary (the `harden` skill).
- [ ] New critical paths are observable: their failures produce a log, metric, or surfaced error.
- [ ] Anything risky has a rollback path.
- [ ] Rulings and "Noticed, not touched" items are reported to the user.
- [ ] A human has reviewed and approved before merge or deploy.
