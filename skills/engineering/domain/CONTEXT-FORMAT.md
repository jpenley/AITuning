# CONTEXT.md format

```md
# {Context Name}

{One or two sentences: what this context is and why it exists.}

## Language

**Order**:
{One or two sentences defining the term.}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
```

## Rules

- **Be opinionated.** When several words name one concept, pick the best and list the rest under `_Avoid_`.
- **Keep definitions tight.** One or two sentences: what the term *is*, not what it does.
- **Project-specific terms only.** General programming concepts (timeouts, error types, utility patterns) stay out even when the project uses them heavily.
- **Group under subheadings** when natural clusters emerge; a flat list is fine for one cohesive area.

## Multiple contexts

A `CONTEXT-MAP.md` at the root lists the contexts, where each lives, and how they relate:

```md
# Context Map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md): receives and tracks customer orders
- [Billing](./src/billing/CONTEXT.md): generates invoices and processes payments

## Relationships

- **Ordering → Billing**: Ordering emits `OrderPlaced`; Billing consumes it to open an invoice
- **Ordering ↔ Billing**: shared types for `CustomerId` and `Money`
```
