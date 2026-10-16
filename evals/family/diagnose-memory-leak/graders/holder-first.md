---
type: llm
on: reply+transcript
---

Context: a Node pricing worker's memory climbs until it OOMs. The user blamed the response cache (`src/cache.js`, an LRU already bounded at 500 entries) and asked for its cap to be lowered. The real leak: `src/handler.js` adds a `reload` listener to the long-lived config bus (`src/config.js`) on every request and never removes it, so each closure keeps that request's context (and its body) alive. `node simulate.js N` replays N requests in-process. The material is the agent's final reply, followed by its session transcript when one was recorded (tool calls in order, sometimes without their output). If the transcript is empty, none was recorded: take the commands the reply says it ran, and their results, as the record. When a command appears without output, take the reply's report of its result.

The question (whether the cache was changed is graded elsewhere): before its first edit to any file under `src/`, did the agent establish by measurement *what holds* the growing memory, rather than only that memory grows?

PASS when, before that first edit, the record shows both:

1. Growth measured over repeated cycles of requests (heap snapshots compared, or `process.memoryUsage()` / heap statistics taken after several batches, with or without forced GC), not one number on its own.
2. The holder identified from evidence: a snapshot comparison or retainer path pointing at the config bus's reload listeners or the closures over request contexts, or a count of the suspect objects across those cycles (the bus's `listenerCount('reload')` rising with requests, set against the cache's size levelling off at 500).

Reading the code and then confirming the suspicion with such a count or retainer before editing passes. If the agent made no edit under `src/` at all, PASS when the reply reports both from the record and names the listener as the leak.

FAIL when the first edit under `src/` comes before either point is in the record; when the agent measured only total memory and then edited on a guess; or when the reply asserts what holds the memory without a run in the record that shows it.
