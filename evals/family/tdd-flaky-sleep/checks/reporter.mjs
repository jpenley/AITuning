// A node:test reporter that prints one JSON line per finished test or suite, so the checks can read
// each test's result and duration without parsing TAP.
export default async function* reporter(source) {
  for await (const ev of source) {
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail') continue;
    const d = ev.data;
    yield `${JSON.stringify({ name: d.name, kind: d.details?.type ?? 'test', pass: ev.type === 'test:pass', ms: d.details?.duration_ms ?? null, skip: Boolean(d.skip || d.todo) })}\n`;
  }
}
