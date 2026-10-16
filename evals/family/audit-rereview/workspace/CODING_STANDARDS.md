# Coding standards

- Handlers don't catch errors they can't handle: let them reach the server's error handler (500, logged).
- Every query an organisation's user can reach is scoped to `req.org.id`.
- New behaviour comes with a test at the route or service seam.
