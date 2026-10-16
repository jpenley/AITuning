# Invoice export

Status: approved (revision 2, 2026-09-28)

Finance users download their organisation's invoices for a date range as a CSV file they open in Excel.

## Global Constraints

- Every export endpoint checks that the caller belongs to the export's organisation: `requireAuth` and `requireOrg` on the route, and every query scoped to `req.org.id`.
- `POST /exports` answers 201 only when the export was stored. Any failure reaches the server's error handler (500, logged); the caller never gets a success for an export that doesn't exist.
- CSV output follows RFC 4180 (quote fields, double inner quotes) and is safe to open in Excel: a cell starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'`.

## Tickets

- [07-csv-export](tickets/07-csv-export.md)
