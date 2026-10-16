---
type: llm
on: diff
---

Context: the diff is an agent's whole change to a small order service. It should add one Mermaid diagram of how an order moves through the project, from the HTTP request to the confirmation email.

The code's real flow, read from the source:

1. `POST /orders` reaches `createOrder` in the order route.
2. The route asks the inventory service to reserve stock. If that fails it answers 409 and stops.
3. The route asks the payment service to charge the card; payment calls a payment gateway over HTTP. If the charge fails the route releases the stock and answers 402.
4. The route saves the order in the orders store.
5. The route puts a message on the email queue and answers 201.
6. Separately, an email worker takes messages off the queue and asks the mailer to send the confirmation.

There is no fraud service anywhere in the code.

PASS if the diagram shows the request, inventory, payment, saving the order, the queue, and the worker sending the email, in that order, and no solid arrow joins two things the code does not join. A step drawn in a slightly different grouping or with different wording is fine. Failure branches may be shown or left out.

FAIL if a main-path step is missing, the order of the steps is wrong, an arrow joins things the code does not join, or a component that is not in the code is drawn as real. If the diff has no Mermaid diagram, FAIL.
