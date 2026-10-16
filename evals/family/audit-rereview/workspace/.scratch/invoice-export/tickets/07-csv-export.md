# 07: CSV export of invoices

Spec: [Invoice export](../spec.md), revision 2
Status: in review

## What

- `POST /exports` with `{ from, to }` builds a CSV of the caller organisation's invoices issued in the range, stores it, and answers `201 { id }`.
- `GET /exports/:id/download` returns a stored export as a `text/csv` attachment.

## Acceptance

- The CSV has the header `number,customer,total,issued` and one line per invoice, CRLF line ends, totals with two decimals.
- Both endpoints follow the spec's Global Constraints.

## Verify

`npm test`
