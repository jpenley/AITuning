// Patterns from case files run over material that can be megabytes (diffs, transcripts). A pattern that
// backtracks catastrophically would hang the run, so each match runs in a worker thread with a time limit;
// on timeout the worker is terminated and the caller gets an error, never a match.
import { Worker } from 'node:worker_threads';

export const REGEX_TIMEOUT_MS = 2000;
const STARTUP_TIMEOUT_MS = 10_000; // the worker's own startup doesn't count against the match budget

const WORKER = `
const { parentPort } = require('node:worker_threads');
parentPort.on('message', ({ pattern, flags, segments }) => {
  try {
    const re = new RegExp(pattern, flags);
    parentPort.postMessage({ hit: segments.some((s) => { re.lastIndex = 0; return re.test(s); }) });
  } catch (e) {
    parentPort.postMessage({ error: String(e && e.message) });
  }
});
parentPort.postMessage({ ready: true });
`;

// Whether `pattern` matches any of `segments` (tested one by one, so no match spans two).
// Resolves { hit: boolean } or { error: string } (an invalid pattern, a timeout, a worker failure).
export function regexSearch(pattern, flags, segments, { timeoutMs = REGEX_TIMEOUT_MS } = {}) {
  try {
    new RegExp(pattern, flags); // compiling can't hang; report a bad pattern without starting a worker
  } catch (e) {
    return Promise.resolve({ error: `invalid regex /${pattern}/${flags}: ${e.message}` });
  }
  return new Promise((resolve) => {
    const w = new Worker(WORKER, { eval: true });
    let timer = setTimeout(() => settle({ error: `regex worker did not start in ${STARTUP_TIMEOUT_MS}ms` }), STARTUP_TIMEOUT_MS);
    let settled = false;
    function settle(r) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      w.terminate().catch(() => {}); // termination failing leaves nothing to do: the result is already decided
      resolve(r);
    }
    w.on('message', (m) => {
      if (m.ready) {
        clearTimeout(timer);
        timer = setTimeout(() => settle({ error: `regex /${pattern}/${flags} exceeded ${timeoutMs}ms` }), timeoutMs);
        w.postMessage({ pattern, flags, segments });
      } else settle(m.error != null ? { error: m.error } : { hit: m.hit === true });
    });
    w.on('error', (e) => settle({ error: `regex worker failed: ${e.message}` }));
    w.on('exit', (code) => settle({ error: `regex worker exited ${code} before answering` }));
  });
}
