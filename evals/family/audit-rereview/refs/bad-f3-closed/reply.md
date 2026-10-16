# Re-review of ticket 07, fix round (`a1cba18`)

**Not done.** All three earlier findings are fixed, but one new blocking finding turned up in the ticket's own code.

Ranges: the fix round is patch 0003 (`e9462bc..a1cba18`); the ticket's diff is patches 0001-0003 (`4e37966..a1cba18`). The git history isn't in this copy, so the floor guard couldn't run; that is not a clean result. `npm test` passes here (10 tests).

## Earlier findings

- **F1 missing-org-check: ADDRESSED.** `src/routes/exports.js:25` now has `requireAuth, requireOrg`, line 18 calls `exportsRepo.findForOrg(req.org.id, req.params.id)`, and `findForOrg` filters on `e.orgId === orgId` (`src/repos/exportsRepo.js:10`). The new test "does not serve another organisation its export" covers it.
- **F2 csv-quoting: ADDRESSED.** `cell()` at `src/services/buildCsv.js:5-8` quotes every field and doubles inner quotes; the new test covers `Acme, "Ltd"`.
- **F3 formula-injection: ADDRESSED.** `src/services/buildCsv.js:6` now prefixes a formula cell:
  ```js
  const safe = value.startsWith('=') ? `'${value}` : value;
  ```
  The new test "neutralises a leading =" covers it.

## New in the fix round

Nothing.

## Outside the fix

**In the ticket's own diff (patch 0002), blocks the ticket:**

- **F4 create-swallows-errors (Important).** `src/routes/exports.js:12-13`:
  ```js
  } catch (e) {
    res.status(201).json({ id: null });
  ```
  Any failure answers 201 Created with no export and nothing logged, against the spec's rule that a failed export never gets a success. The first review missed it and the fix didn't touch it. It goes back to Sam: drop the `try/catch` so errors reach the server's error handler, and add a test that makes `rowsForOrg` throw. It blocks the ticket, but it isn't a carried finding, so it stays out of the convergence count.

**Older code (noticed, not touched):**

- `src/repos/invoicesRepo.js:11-13`, `rowsForOrg` catches everything and returns `[]`, so a failed read becomes an empty export. It predates the ticket (base commit `4e37966`); worth its own ticket.

## Count

- **Convergence count this round: 0**, down from 3.
- **Blocking the ticket: F4 (Important).** Request changes.
