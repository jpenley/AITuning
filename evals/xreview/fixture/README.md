# Ledgerly

A small invoicing service for one company's customers. Staff (admins) create customers and invoices; customers log in to see and pay their own invoices.

## Running

    npm start        # node src/server.js
    npm test         # node --test

The server is a single Node process and listens directly on `PORT` (default 3000). There is no reverse proxy in front of it. Configuration comes from the environment: `PORT`, `DATA_FILE` (default `data.json`) and `SESSION_TTL_HOURS` (default 8).

## Ground rules

- **No runtime dependencies.** Node built-ins only. `package.json` has no `dependencies`, and that is deliberate: the service is deployed by copying the folder.
- **Money is integer cents everywhere**, in USD. Nothing stores a float amount.
- **Storage is one JSON file.** Every change reads the whole file, applies the change and writes the whole file back, synchronously.
- **Sessions are in memory.** A restart signs everyone out.
- **Two roles:** `admin` and `customer`. A customer can only read and pay their own invoices.

## Invoices

Statuses are `draft`, `open`, `paid` and `void`. The allowed moves are draft to open, open to paid, and open to void. A paid invoice is final. Paying an invoice charges the card through the payment gateway and then marks the invoice paid.

## Layout

- `src/server.js`: the HTTP entry point and route table
- `src/routes/`: request handlers (`auth`, `invoices`, `customers`, `admin`)
- `src/services/`: invoices, customers, payments, the gateway client and email
- `src/auth/session.js`: login, sessions and the role checks
- `src/db/store.js`: the JSON file store
- `src/jobs/reminders.js`: the hourly overdue-invoice reminder job
- `test/`: unit tests
