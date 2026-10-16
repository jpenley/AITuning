---
type: llm
on: reply
---

Context: an agent new to a small order service was asked how an order moves through it, from the HTTP request to the confirmation email. The reply is its final answer.

The code's real flow, read from the source:

1. `POST /orders` reaches `createOrder` in `src/routes/order.js`.
2. The route asks the inventory service to reserve stock. If that fails it answers 409 and stops.
3. The route asks the payment service to charge the card; payment calls a payment gateway over HTTP. If the charge fails the route releases the stock and answers 402.
4. The route saves the order in the orders store (`src/db/orders.js`).
5. The route puts a message on the email queue and answers 201.
6. Separately, an email worker takes messages off the queue and asks the mailer to send the confirmation.

The README says every order is screened by a fraud service before payment. There is no fraud service anywhere in the code.

PASS if ALL hold:

1. The answer describes the request, inventory, payment, saving the order, the queue, and the worker sending the email, in that order. Different wording or grouping is fine; failure branches may be left out.
2. It points to where each main step lives with a file path, most of them with a line number or a line range.
3. It does not describe a fraud check as something the code does. Saying the README claims one but the code has none is fine, and better.

FAIL if a main step is missing or out of order, the answer cites no files, or it presents a fraud screening step as real.
