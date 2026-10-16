# ledgerly-billing

The billing service behind Ledgerly's finance pages. Plain Node, no dependencies.

- `npm test` runs the suite (`node --test`).
- `npm start` serves on port 3000. Requests carry the signed-in user (set by the session layer) and an `x-org-id` header.
- Routes live in `src/routes/`, one file per resource; data access in `src/repos/`. Errors a handler doesn't handle go to the server's error handler, which answers 500 and logs them.

Specs and tickets are under `.scratch/<feature>/`.
