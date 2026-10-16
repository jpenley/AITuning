# shop

A small order service.

## How it works

Customers POST an order to `/orders`. Every order is screened by the fraud service before payment, stock is held for the customer, the card is charged, the order is stored, and a confirmation email is sent.

## Layout

- `src/server.js`: the HTTP entry point
- `src/routes/order.js`: the order route
- `src/services/`: inventory, payment and mail
- `src/db/orders.js`: order storage
- `src/queue/`: the email queue and its worker
