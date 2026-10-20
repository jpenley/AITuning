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

## When queries are written from the glossary

In a data or analytics project (a warehouse, dbt models, dashboards), people and agents write queries from these terms, so each entry carries what a correct query needs, under its definition:

```md
**Store**:
A physical shop that sells to the public; online sales are not a Store.
_Key_: `store_id`; Orders link to it by `orders.store_id`, Staff by `staff.home_store_id`
_Avoid_: Branch, location

**Same-Store Sales Growth**:
Sales growth counting only Stores open for the whole of both periods.
_Formula_: `sum(net_amount)` this period / the same period last year - 1, over Stores open 13+ months
_Source_: `fct_sales` (from `stg_pos__orders`); fiscal weeks, store local time
_Avoid_: Comp sales, like-for-like

## Filters

- **Training Store**: `stores.is_training = true`; excluded from every sales figure.
```

The **Filters** section lists the rows every query must exclude (test, internal, fraud, and the like), each with the flag that marks them.

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
