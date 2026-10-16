---
name: modules
description: Use when designing or changing a module's interface or a public API or contract, deciding where a seam goes, making queue consumers, webhooks, or retries idempotent against duplicate delivery, or making code more testable or easier for agents to navigate.
---

# Modules

Design **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. The aim is leverage for callers, locality for maintainers, and testability for everyone.

## Vocabulary

Use these terms exactly when discussing a design. Consistent words are the point.

- **Module**: anything with an interface and an implementation, at any scale: function, class, package, tier-spanning slice.
- **Interface**: everything a caller must know to use the module correctly: the type signature plus invariants, ordering constraints, error modes, required configuration, and performance characteristics.
- **Implementation**: the code inside a module.
- **Depth**: leverage at the interface; how much behaviour a caller or test reaches per unit of interface learned. **Deep** means a large amount of behaviour behind a small interface; **shallow** means the interface is nearly as complex as the implementation.
- **Seam** (Feathers): a place where behaviour can change without editing that place; the location where a module's interface lives. Where the seam goes is its own decision, separate from what sits behind it.
- **Adapter**: a concrete thing that satisfies an interface at a seam. Names a role, not a size: a Postgres repository and an in-memory fake are both adapters.
- **Leverage**: what callers gain from depth; one implementation pays back across N call sites and M tests.
- **Locality**: what maintainers gain from depth; change, bugs, and verification concentrate in one place.

## Principles

- **Depth belongs to the interface.** A deep module may be built from small, swappable internal parts with **internal seams** its own tests use; they stay out of the interface.
- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across callers, it earned its keep.
- **The interface is the test surface.** Callers and tests cross the same seam. Wanting to test past the interface signals the wrong shape.
- **One adapter is a hypothetical seam; two adapters make a real one.** Introduce a seam only when something actually varies across it (typically production and test).

## Designing for testability

- **Accept dependencies** as parameters instead of constructing them inside: `processOrder(order, paymentGateway)`.
- **Return results** instead of mutating state: `calculateDiscount(cart): Discount`.
- **Keep the surface small**: fewer methods mean fewer tests; fewer parameters mean simpler setup. Ask of any interface: can it have fewer methods, simpler parameters, more hidden inside?

## Public interfaces

When other people's code depends on the interface (a public API, a library surface, a contract between services or teams):

- **Every observable behaviour is a commitment** (Hyrum's law): with enough consumers, someone depends on your error text, ordering, timing, and quirks. Expose deliberately; keep implementation details unobservable.
- **Add rather than modify**: new optional fields and new operations; never change a field's type or remove it without a deliberate major version and a migration note.
- **One error strategy**: a single error shape and one way of signalling failure across the surface, not a mix of throwing, returning null, and returning error objects.
- **Validate at the boundary, trust inside**: external input and third-party responses are checked where they enter; internal code that shares the type contract doesn't re-validate.
- **One version at a time**: extend rather than fork, so consumers never have to choose between versions of the same thing.
- **Define the contract first**: the interface is agreed before either side implements it.

State-changing operations that may be delivered more than once (retries, queues, webhooks, payments) need idempotency done properly: [IDEMPOTENCY.md](IDEMPOTENCY.md).

Tools a model calls (an MCP server, function-calling schemas, a CLI an agent drives) are an interface read cold, with no docs beside it: [AGENT-TOOLS.md](AGENT-TOOLS.md).

## Going deeper

- Deepening a cluster of shallow modules given its dependencies (dependency categories, replacing old tests): [DEEPENING.md](DEEPENING.md).
- Exploring several alternative interfaces with parallel sub-agents: [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md).
