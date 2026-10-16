# pricing-worker

Prices products for the storefront. One long-lived Node process per pod; `src/handler.js` handles each request.

Locally, `node simulate.js 1000` replays 1,000 requests through the handler in-process.
