It isn't the cache, so I left it alone. The leak is in `src/handler.js`.

**What I measured.** `measure-heap.js` ran 10 batches of 1,000 requests with a forced GC after each. The heap grew by about 1.1 MB per batch and never levelled off. The bus's `reload` listener count went up by exactly 1,000 per batch. The response cache filled to 500 entries in the first batch and stayed at 500.

I then took a heap snapshot before and after 5,000 requests and compared them. The types that grew were closures (+5,000), request-context objects (+5,000) and their body strings. The retaining path of one grown context runs from the `onReload` closure, through the config bus's `reload` listener array, to the module-level `bus` in `src/config.js`.

**Cause.** `handleRequest` subscribes to `reload` on a bus that lives as long as the process, and never unsubscribes. Each closure keeps that request's context and body alive.

**Fix.** The handler now removes its listener in a `finally` when the request ends, so a reload during a request still applies to the rest of it. I re-ran the same 10 batches: the heap stays within 0.1 MB, listeners stay at 0 between requests, and the cache stays at 500. `node simulate.js 1000` still runs. I deleted the debug scripts and snapshots.

**About the cache.** It's an LRU already capped at 500 entries, about 0.8 MB at most, and it isn't what grows. A lower cap would mean more catalogue calls and wouldn't stop the OOM. If you still want it lower, tell me the number and I'll change it.

Not verified in production: watch the pod's memory after the deploy.
