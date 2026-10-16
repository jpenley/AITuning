# Deepening

How to deepen a cluster of shallow modules safely, given its dependencies. Uses the vocabulary in [SKILL.md](SKILL.md).

## Dependency categories

Classify each dependency of the candidate; the category decides how the deepened module is tested across its seam.

1. **In-process**: pure computation, in-memory state, no I/O. Always deepenable: merge the modules and test through the new interface directly. No adapter.
2. **Local-substitutable**: has a local test stand-in (PGLite for Postgres, an in-memory filesystem). Deepenable when the stand-in exists; tests run against it. The seam stays internal; no port at the external interface.
3. **Remote but owned** (ports and adapters): your own services across a network. Define a **port** at the seam; the deep module owns the logic and the transport is an injected adapter: in-memory for tests, HTTP/gRPC/queue in production.
4. **True external**: third-party services you don't control (Stripe, Twilio). The deepened module takes the dependency as an injected port; tests supply a fake or stub adapter (a mock only when call counts or ordering are part of the contract).

## Tests: replace, don't layer

Once tests exist at the deepened module's interface, delete the old unit tests on the shallow modules it absorbed. Seams and interface-level testing follow the principles in [SKILL.md](SKILL.md).
