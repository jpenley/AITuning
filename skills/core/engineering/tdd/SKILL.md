---
name: tdd
description: Use when building a feature or fixing a bug test-first, when the user mentions red-green-refactor, unit tests, or integration tests, or when writing or changing tests.
---

# TDD

TDD is the red-green loop. This skill is what makes the loop produce tests worth keeping: where tests go, the rules of the loop, and what a good test is. Consult it before and during the loop, not after.

Read `CONTEXT.md` (if present) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area.

## Discover the stack first

Find how *this* repo runs tests before writing one: the checked-in wrappers (`./gradlew`, `make test`, a repo script) before global tools; the command that runs one focused test and the one that runs the full suite; where tests live and how neighbouring tests are written; and what the README, CONTRIBUTING, and CI actually run. Use the focused command during the loop and the full suite before finishing. Read [Verification cadence](../evidence/CHECKS.md) for reuse, invalidation and delivery gates; red-before-green remains mandatory. Never assume a default command.

## Seams: where tests go

Tests live at **seams** (the `modules` skill defines the term): where a module's interface lives, so behaviour is observable without reaching inside. Never test against internals.

**Agree the seams first.** Before writing any test, list the seams under test and confirm them with the user: "What's the public interface, and which seams should we test?" Tests go only at confirmed seams. Agreeing them up front puts testing effort on the critical paths and complex logic instead of every edge case.

When the shape of the interface itself is in question (how deep the module is, where the seam belongs, what it should expose), load the `modules` skill with your skill tool for the vocabulary.

## Rules of the loop

- **Red before green.** Write the failing test, run it, and watch it fail for the expected reason (the behaviour is missing, not a typo or import error). Then write only enough code to pass it.
- **One vertical slice per cycle.** One seam, one test, one minimal implementation. Each test is a **tracer bullet** that responds to what the last cycle taught you. Writing all the tests first and then all the code tests imagined behaviour.
- **Refactoring waits for review.** Cleanup belongs to the review stage (the `audit` skill finds it, the `refine` skill does it), outside the red-green cycle.
- **Adding tests to existing code:** the implementation is read-only while you write them. A test that exposes a bug stays failing and the bug is reported; never weaken the assertion to match what the code does.

For numerical algorithms or solvers, read the probe procedure in [PROBES.md](../optimize/PROBES.md) before selecting assertions or changing the production implementation.

## Property-based tests

Use them when the code has an algebraic shape: a parser and its printer, an encoder and decoder, a sort, a normaliser, a pure calculation with rules that hold for every input. Pick the strongest property that is true; from weakest to strongest they run: it doesn't crash → the output has the right type or shape → an invariant holds → applying it twice changes nothing → a round trip returns the input, or an independent oracle agrees. When the pure core is buried under I/O, extracting it is a design change: propose it rather than doing it inside the cycle. A property test that asserts nothing real (restates the implementation, or filters away almost every generated input) is worse than none. When one fails, decide which is wrong before changing code: the property, the spec (ambiguous), or the code (a real bug). Check the spec, then the types and docs, then the existing tests.

## Writing each test

Before writing a test body, **name the break it catches**: the production change that should make it fail. Then write it by the rules in [GOOD-TESTS.md](GOOD-TESTS.md): expected values derived independently, behaviour asserted through the interface, mocks only at system boundaries. Walk its mutation check before finishing a test file.
