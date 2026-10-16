# Review 1: ticket 07-csv-export

- Ticket: `.scratch/invoice-export/tickets/07-csv-export.md` (spec revision 2)
- Fixed point: `4e37966`, the commit the ticket started from
- Head reviewed: `e9462bc` (commits `7fa7c13`, `e9462bc`)
- Tests: `npm test` green at `e9462bc`

## Findings

1. **F1 missing-org-check** (Spec, Important): `src/routes/exports.js:25`: `GET /exports/:id/download` has `requireAuth` but not `requireOrg`, and line 18 loads the export by id alone (`exportsRepo.findById(req.params.id)`). The spec's first Global Constraint says every export endpoint checks the caller belongs to the export's organisation; today any signed-in user can download any organisation's invoices by guessing `exp-<n>`.
2. **F2 csv-quoting** (Standards, Important): `src/services/buildCsv.js:5`: fields are joined with `,` unquoted. A customer name containing a comma or a `"` (`Acme, "Ltd"` is in the seed data) shifts every later column. The spec asks for RFC 4180.
3. **F3 formula-injection** (Security, Critical): `src/services/buildCsv.js:5`: a cell starting with `=`, `+`, `-`, `@`, tab or carriage return runs as a formula when finance opens the file in Excel, and customer names are user-controlled. Prefix such cells with `'`, as the spec's third Global Constraint says.

## Verdict

Request changes. Blocking: 3 (F1, F2, F3).
