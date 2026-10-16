// Run from the workspace: loads server.js (the registry over tools.js) and checks the tools an agent wrote.
//   node tools.cjs works          the four tools exist and really drive tracker.js
//   node tools.cjs <property>     one interface property (names below); exit 0 when present
//   node tools.cjs score          exit 0 when at least 6 of the 8 properties are present
// Each verdict is printed on stderr with the reason.
const { resolve } = require('node:path');

const tracker = require(resolve('tracker.js'));
let server;
try {
  server = require(resolve('server.js'));
} catch (e) {
  console.error(`server.js failed to load: ${e.message}`);
  process.exit(1);
}

const tools = (() => {
  try {
    return server.listTools();
  } catch (e) {
    return [];
  }
})();

// Which tool is which, by name: create, update, search, get (first match wins, in that order).
const kinds = [
  ['create', /create|add|new/i],
  ['update', /update|edit|patch|modify|transition|move|change|set/i],
  ['search', /search|find|list|query/i],
  ['get', /get|read|fetch|show|view|lookup/i],
];
const byKind = { create: [], update: [], search: [], get: [] };
for (const t of tools) {
  const k = kinds.find(([, re]) => re.test(t.name ?? ''));
  if (k) byKind[k[0]].push(t);
}
const one = (k) => byKind[k][0];
const props = (t) => t?.inputSchema?.properties ?? {};
const findProp = (t, ...res) => {
  const names = Object.keys(props(t)).filter((n) => !/idempot/i.test(n));
  for (const re of res) {
    const n = names.find((x) => re.test(x));
    if (n) return n;
  }
  return null;
};
const idProp = (t) => findProp(t, /^(?:id|key|issue_?id|issue_?key|ticket_?id)$/i, /(?:id|key)$/i);
const statusProp = (t) => findProp(t, /^status$/i, /status|state/i);
const queryProp = (t) => findProp(t, /^(?:q|query|text|search|term|keywords?)$/i, /query|text|search|term/i);
const titleProp = (t) => findProp(t, /^title$/i, /title|summary|name/i);
const limitProp = (t) => findProp(t, /^(?:limit|per_?page|page_?size|max_?results|count|top|n)$/i, /limit|size|max/i);
const statusTool = () => byKind.update.find((t) => statusProp(t)) ?? one('update');

// Fill required arguments the check didn't set, from the schema.
function fill(t, given) {
  const args = { ...given };
  for (const name of t?.inputSchema?.required ?? []) {
    if (args[name] !== undefined) continue;
    const p = props(t)[name] ?? {};
    if (Array.isArray(p.enum)) args[name] = p.enum[0];
    else if (p.type === 'integer' || p.type === 'number') args[name] = p.minimum ?? p.default ?? 1;
    else if (p.type === 'boolean') args[name] = false;
    else if (p.type === 'array') args[name] = [];
    else args[name] = p.default ?? 'probe';
  }
  return args;
}

async function call(t, args) {
  const r = await server.callTool(t.name, fill(t, args));
  const text = (r?.content ?? []).map((c) => c?.text ?? '').join('\n');
  return { r: r ?? {}, all: `${text}\n${JSON.stringify(r?.structuredContent ?? null)}` };
}

const STATUS_SET = [...tracker.STATUSES].sort().join(',');
const enumOf = (p) => p?.enum ?? p?.items?.enum;

const checks = {
  // Every read tool says it is read-only.
  'read-hints': async () => {
    const reads = [...byKind.search, ...byKind.get];
    if (!byKind.search.length || !byKind.get.length) return [false, 'no search or get tool'];
    const bad = reads.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name);
    return [!bad.length, bad.length ? `no readOnlyHint: true on ${bad.join(', ')}` : 'readOnlyHint on every read'];
  },
  // Every write tool states whether it is destructive and whether a retry is safe.
  'write-hints': async () => {
    const writes = [...byKind.create, ...byKind.update];
    if (!byKind.create.length || !byKind.update.length) return [false, 'no create or update tool'];
    const bad = writes
      .filter((t) => t.annotations?.readOnlyHint === true || typeof t.annotations?.destructiveHint !== 'boolean' || typeof t.annotations?.idempotentHint !== 'boolean')
      .map((t) => t.name);
    return [!bad.length, bad.length ? `destructiveHint/idempotentHint missing (or marked read-only) on ${bad.join(', ')}` : 'both hints on every write'];
  },
  // Every id parameter carries a pattern that accepts TRK-12 and rejects junk.
  'id-pattern': async () => {
    const withId = [...byKind.get, ...byKind.update];
    if (!byKind.get.length || !byKind.update.length) return [false, 'no get or update tool'];
    for (const t of withId) {
      const n = idProp(t);
      const pat = n && props(t)[n].pattern;
      if (!pat) return [false, `${t.name}: id parameter ${n ?? '(none)'} has no pattern`];
      const re = new RegExp(pat);
      if (!re.test('TRK-12') || !re.test('TRK-600') || re.test('12') || re.test('abc')) return [false, `${t.name}: pattern ${pat} does not fit TRK-<n>`];
    }
    return [true, 'id patterns fit TRK-<n>'];
  },
  // The status the update takes, and any status filter on search, is an enum of exactly the tracker's statuses.
  'status-enum': async () => {
    const t = statusTool();
    const n = t && statusProp(t);
    if (!n) return [false, 'no status parameter on an update tool'];
    if ([...(enumOf(props(t)[n]) ?? [])].sort().join(',') !== STATUS_SET) return [false, `${t.name}.${n} is not an enum of ${STATUS_SET}`];
    const s = one('search');
    const sn = s && statusProp(s);
    if (sn && [...(enumOf(props(s)[sn]) ?? [])].sort().join(',') !== STATUS_SET) return [false, `${s.name}.${sn} is not an enum of ${STATUS_SET}`];
    return [true, 'status enums match'];
  },
  // The search limit has a maximum and a default.
  'limit-bounded': async () => {
    const s = one('search');
    const n = s && limitProp(s);
    if (!n) return [false, 'no limit parameter on search'];
    const p = props(s)[n];
    const max = p.maximum ?? p.exclusiveMaximum;
    if (!Number.isFinite(max)) return [false, `${s.name}.${n} has no maximum`];
    if (p.default === undefined || p.default > max) return [false, `${s.name}.${n} has no default within the maximum`];
    return [true, `${n}: default ${p.default}, max ${max}`];
  },
  // Create's result carries the new issue's id.
  'create-returns-id': async () => {
    const t = one('create');
    const tp = t && titleProp(t);
    if (!tp) return [false, 'no create tool with a title'];
    const title = 'Probe zq7 create';
    const { all } = await call(t, { [tp]: title });
    const made = tracker.search({ q: 'zq7 create', limit: 5 }).items[0];
    if (!made) return [false, 'create did not create an issue'];
    return [new RegExp(`\\b${made.id}\\b`).test(all), `created ${made.id}; ${new RegExp(`\\b${made.id}\\b`).test(all) ? 'returned' : 'not in the result'}`];
  },
  // A move the workflow forbids comes back as a tool error naming the allowed next states.
  'transition-next-step': async () => {
    const t = statusTool();
    const ip = t && idProp(t);
    const sp = t && statusProp(t);
    if (!ip || !sp) return [false, 'no update tool with id and status'];
    const { id } = tracker.create({ title: 'Transition probe' });
    let res;
    try {
      res = await call(t, { [ip]: id, [sp]: 'done' });
    } catch (e) {
      return [false, `threw instead of returning a tool error: ${e.message}`];
    }
    if (res.r.isError !== true) return [false, 'open -> done did not return isError'];
    const names = /in[_ ]progress/i.test(res.all) && /wontfix|won'?t ?fix/i.test(res.all);
    return [names, names ? 'error names in_progress and wontfix' : `error does not name the allowed moves: ${res.all.slice(0, 160)}`];
  },
  // A cut search result says how many it showed out of how many matched.
  'truncation-count': async () => {
    const s = one('search');
    if (!s) return [false, 'no search tool'];
    const qp = queryProp(s);
    const total = tracker.search(qp ? { q: 'checkout' } : {}).total;
    const { r, all } = await call(s, qp ? { [qp]: 'checkout' } : {});
    if (r.isError) return [false, 'search returned an error'];
    const shown = new Set(all.match(/\bTRK-\d+\b/g) ?? []).size;
    if (shown >= total) return [false, `returned all ${total} matches: nothing was cut`];
    const nOfM = [...all.matchAll(new RegExp(`\\b(\\d+)\\s*(?:of|out of|/)\\s*(?:about\\s*)?${total}\\b`, 'gi'))].some((m) => Number(m[1]) < total);
    const mThenN = new RegExp(`\\b${total}\\b[^.\\n]{0,60}\\b(?:showing|returned|returning|first)\\b[^.\\n]{0,10}\\b\\d+\\b`, 'i').test(all);
    return [nOfM || mThenN, nOfM || mThenN ? `states the cut out of ${total}` : `cut to ${shown} of ${total} without saying so`];
  },
};

async function works() {
  const missing = Object.keys(byKind).filter((k) => !byKind[k].length);
  if (missing.length) return [false, `missing tools: ${missing.join(', ')}`];
  for (const t of tools) if (typeof t.description !== 'string' || !t.description.trim() || t.inputSchema?.type !== 'object') return [false, `${t.name}: no description or object inputSchema`];
  // get
  const g = one('get');
  const want = tracker.get('TRK-5');
  const got = await call(g, { [idProp(g)]: 'TRK-5' });
  if (got.r.isError || !got.all.includes(want.title)) return [false, `${g.name} TRK-5 did not return its title`];
  // search
  const s = one('search');
  const qp = queryProp(s);
  const found = await call(s, qp ? { [qp]: 'checkout' } : {});
  const ids = found.all.match(/\bTRK-\d+\b/g) ?? [];
  if (found.r.isError || !ids.length) return [false, `${s.name} returned no issues`];
  if (qp && ids.some((id) => !/checkout/i.test(tracker.get(id)?.title ?? ''))) return [false, `${s.name} returned issues that don't match the query`];
  // create
  const c = one('create');
  await call(c, { [titleProp(c)]: 'Probe zq8 works' });
  if (!tracker.search({ q: 'zq8 works' }).total) return [false, `${c.name} did not create the issue`];
  // update: a valid move, and a title change when the update tool takes one
  const u = statusTool();
  const { id } = tracker.create({ title: 'Update probe' });
  const moved = await call(u, { [idProp(u)]: id, [statusProp(u)]: 'in_progress' });
  if (moved.r.isError || tracker.get(id).status !== 'in_progress') return [false, `${u.name} did not move ${id} to in_progress`];
  const rn = byKind.update.find((t) => titleProp(t) && idProp(t));
  if (rn) {
    await call(rn, { [idProp(rn)]: id, [titleProp(rn)]: 'Renamed zq9' });
    if (tracker.get(id).title !== 'Renamed zq9') return [false, `${rn.name} did not change the title`];
  }
  return [true, 'search, get, create and update drive tracker.js'];
}

async function run(name) {
  try {
    return await (name === 'works' ? works() : checks[name]());
  } catch (e) {
    return [false, `check threw: ${e.message}`];
  }
}

(async () => {
  const what = process.argv[2];
  if (what === 'score') {
    let n = 0;
    for (const name of Object.keys(checks)) {
      const [ok, why] = await run(name);
      if (ok) n++;
      console.error(`${ok ? 'PASS' : 'FAIL'} ${name}: ${why}`);
    }
    console.error(`${n} of ${Object.keys(checks).length} properties`);
    process.exit(n >= 6 ? 0 : 1);
  }
  if (what !== 'works' && !checks[what]) {
    console.error(`unknown check: ${what}`);
    process.exit(2);
  }
  const [ok, why] = await run(what);
  console.error(`${ok ? 'PASS' : 'FAIL'} ${what}: ${why}`);
  process.exit(ok ? 0 : 1);
})();
