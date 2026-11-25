# Shared references

Plain references that more than one flowstate skill reads. None of these is a skill. Skills link each one as `../../shared/<FILE>.md`, so a skill copied on its own needs this folder at that relative path.

| File | Contract | Read by |
|---|---|---|
| [CAPABILITIES.md](CAPABILITIES.md) | Capability records, pinned baselines, the final Delta, and advancing on evidence | spec, ticket, build, integrate, release, streamline, audit, crosscheck, evidence |
| [IDENTIFIERS.md](IDENTIFIERS.md) | ID reservation, aliases, and when a blocking edge is satisfied | spec, ticket, build, streamline |
| [REVISION.md](REVISION.md) | Revising approved direction, and reviewing a revised plan | spec, ticket, build, integrate, streamline, audit, crosscheck, evidence |
| [CHECKS.md](CHECKS.md) | Verification cadence and reusable evidence | evidence, audit, build, feedback, integrate, tdd |
| [VERIFY.md](VERIFY.md) | Verifying security findings before acting on them | audit, harden, doubt |
| [PROBES.md](PROBES.md) | Numerical algorithm probes | optimize, tdd |

The setup pack's `adopt` and `setup` skills also name CAPABILITIES, IDENTIFIERS, and REVISION by their path in this collection.
