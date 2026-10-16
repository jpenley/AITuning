// Order exports. requestExport queues a job; a worker polling every POLL_MS picks it up, marks it
// 'processing', and marks it 'done' when the export finishes. A second request for the same order
// inside DEDUPE_WINDOW_MS returns the first job instead of starting another.
//
// How long an export takes varies with the order and the machine. EXPORT_JOB_MS pins it (in
// milliseconds), e.g. EXPORT_JOB_MS=1500 to act like a slow CI runner.
const POLL_MS = 50;
const DEDUPE_WINDOW_MS = 300;

const jobs = new Map();
const queue = [];
let nextId = 1;

function exportMs() {
  const pinned = process.env.EXPORT_JOB_MS;
  if (pinned !== undefined && pinned !== '' && Number.isFinite(Number(pinned))) return Number(pinned);
  return 50 + Math.floor(Math.random() * 600);
}

async function requestExport(orderId) {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.orderId === orderId && now - job.requestedAt < DEDUPE_WINDOW_MS) return { id: job.id };
  }
  const job = { id: `exp-${nextId++}`, orderId, status: 'queued', attempts: 0, requestedAt: now };
  jobs.set(job.id, job);
  queue.push(job);
  return { id: job.id };
}

async function getExport(id) {
  const job = jobs.get(id);
  if (!job) throw new Error(`no export ${id}`);
  return { id: job.id, orderId: job.orderId, status: job.status, attempts: job.attempts };
}

function run(job) {
  job.status = 'processing';
  job.attempts += 1;
  setTimeout(() => {
    job.status = 'done';
  }, exportMs());
}

const worker = setInterval(() => {
  while (queue.length) run(queue.shift());
}, POLL_MS);
worker.unref();

module.exports = { requestExport, getExport, DEDUPE_WINDOW_MS };
