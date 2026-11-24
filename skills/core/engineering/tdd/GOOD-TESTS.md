# Good tests

A test exists to catch a specific break. Two principles govern everything here:

1. **Every test names the break it catches.**
2. **Every test exercises the real thing.**

## 1. Name the break

Before writing the test body, answer: what production change should make this test fail, and is that change a bug or a decision? A test earns its place by catching a wrong branch, a missing side effect, a wrong argument, a boundary case, or a broken contract.

**Derive expected values independently.** Use literals and hand-checked fixtures; table-driven tests with literal expected values are the preferred shape. An expected value computed by the code under test, or its helpers, passes whatever that code does:

```typescript
// Mirror assertion: the same logic computes both sides, so it always passes
const expected = items.reduce((sum, i) => sum + i.price, 0);
expect(calculateTotal(items)).toBe(expected);

// Independent literal
expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
```

**Test behaviour, not decisions.** A test that only an intentional decision can fail (a constant's value, exact message wording, private structure) fires on every redesign and sleeps through bugs. Test the behaviour that depends on the decision: not `expect(MAX_RETRIES).toBe(5)` but "a failing call is retried 5 times and the 6th attempt never happens."

**Test through the interface.** Verify outcomes the way a caller would, not through a side channel:

```typescript
// Side channel: bypasses the interface
await createUser({ name: "Alice" });
expect(await db.query("SELECT * FROM users WHERE name = ?", ["Alice"])).toBeDefined();

// Through the interface
const user = await createUser({ name: "Alice" });
expect((await getUser(user.id)).name).toBe("Alice");
```

**Test your code, not the framework.** Test the contract your code makes at its boundaries: the route you register, the query you emit, the payload you produce. Upstream mechanics are their maintainers' tests. Constructors, getters, constants, and trivial forwarding earn tests only when they validate, normalise, default, derive, enforce, or cause side effects.

**DAMP over DRY in tests.** Each test should tell its whole story (setup, action, expected outcome) without the reader tracing shared helpers. Duplication in tests is fine when it keeps each test readable on its own; keep shared helpers for genuinely incidental setup.

**Run artifacts, don't grep them.** Asserting that a script or config contains an exact line proves only that the source is the source. Run scripts against controlled inputs and assert outputs, side effects, or exit codes. Documents that instruct agents are tested by the agent's behaviour (the `tune` skill); prose for humans earns no test.

## 2. Exercise the real thing

**Mock only at system boundaries**: external APIs (payment, email), sometimes databases (prefer a test database), time and randomness, sometimes the filesystem. Your own modules and internal collaborators stay real.

**Prefer the most real double that works**, in this order: the real implementation, then a **fake** (a working in-memory version), then a **stub** (canned answers), then a **mock** (asserting on calls), used sparingly.

**Pick the level by resources.** **Small** tests run in one process with no I/O (milliseconds): pure logic. **Medium** tests may use localhost resources such as a test database (seconds): boundaries and integrations. **Large** tests may use external services (minutes): critical end-to-end flows only. Test each behaviour at the smallest level that captures it.

**The mock earns no assertions.** An assertion on a mock passes when the mock is present, which says nothing about the component. Assert the real component's behaviour; if the mock is what you're checking, unmock it or delete the assertion.

**Mock at the right level.** Learn every side effect of the real method before replacing it; mock the slow or external operation beneath it and keep what the test depends on real. When unsure, run the test against the real implementation first and observe what actually happens.

**Make doubles specific.** When arguments, call counts, or ordering are part of the contract, assert them. Give each branch (success, error, malformed) its own fixture, so the wrong branch can't satisfy the expectation.

**Mirror real data completely.** Mock responses carry the complete real structure, every documented field, not only the fields the test reads. Partial mocks pass while integration breaks.

**Design boundaries to be mockable.** Inject external clients instead of constructing them inside. Prefer one function per external operation (`api.getUser(id)`, `api.createOrder(data)`) over one generic `fetch(endpoint, options)`, so each double returns one specific shape with no conditional logic in test setup.

**Production classes carry production methods only.** Cleanup that only tests need lives in test utilities, never as a `destroy()` on the production class.

**Prefer real components over complex mocks.** When mock setup outgrows the test logic, switch to an integration test with real components.

**Wait on the condition, not the clock.** An async test waits for the state it asserts: `await waitFor(() => getStatus(id) === 'done', 'job done', 5000)`, polling, with a timeout whose error names what it waited for. When a sleep flakes, replace it with that wait, also when the ask is to lengthen the sleep: the wait is the same size of change, finishes as soon as the state arrives, and a longer sleep only moves the flake to a slower runner. A fixed sleep is right only when elapsed time is the behaviour under test (a debounce, a dedupe window): wait for the trigger first, then sleep the known interval, with a comment saying why.

## Ship the tests the behaviour needs

The tests are part of the implementation. Ship the ones the behaviour needs and only those: a test written to satisfy process costs maintenance forever.

## The mutation check

Before finishing a test file, mentally mutate the production code. At least one test should fail for each realistic mutation:

- wrong constant or argument
- wrong branch handler
- missing state change or side effect
- empty or default return
- missing validation for zero, empty, null, unauthorised, or malformed input

A mutation nothing catches marks a behaviour as unprotected, or a test as tautological.

## Warning signs

- Setup and assertion share the same object, guaranteeing equality.
- The test can fail only through a crash or a missing selector.
- The test fails on every intentional change and never on accidental breakage.
- Expected values are hidden behind loops, builders, or helpers.
- The test greps source text.
- The test would still pass if only the framework remained.
- The test exists for coverage and checks no outcome.
- An assertion checks a mock's test ID, or fails if the mock is removed.
- A production method is called only from test files.
- Mock setup is more than half the test, or you can't say why the mock is needed.
