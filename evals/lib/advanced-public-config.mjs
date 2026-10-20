// Explicit opt-in for public paid CLIs. This guard runs before executable/provider/authentication discovery.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// These small schemas are a closed subset, not an arbitrary JSON Schema evaluator.
// Use the very schemas sent to the CLIs so fresh responses and disk evidence obey the same contract.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validateContract(value, schema, label = 'response contract') {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (!types.includes(type) || schema.enum && !schema.enum.includes(value)) throw new Error(`${label}: invalid ${schema.type}`);
  if (type === 'object') {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) throw new Error(`${label}: missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties ?? {}, key)) {
        if (schema.additionalProperties === false) throw new Error(`${label}: unknown ${key}`);
      } else validateContract(item, schema.properties[key], `${label}.${key}`);
    }
  } else if (type === 'array') value.forEach((item, i) => validateContract(item, schema.items, `${label}[${i}]`));
  return value;
}
export function checkedReply(reply, schema) {
  if (!reply.ok) return reply;
  try { validateContract(reply.data, schema); return reply; }
  catch (e) { return { ...reply, ok: false, error: e.message }; }
}
export function validateJudgments(judgments, packet, keyEntry, schema) {
  validateContract({ judgments }, schema, 'judge contract');
  const ids = new Set(packet.map(f => f.id));
  const flaws = new Set(keyEntry.flaws.map(f => f.id));
  if (judgments.length !== ids.size || new Set(judgments.map(j => j.id)).size !== ids.size || judgments.some(j => !ids.has(j.id))) throw new Error('incomplete judge answers: duplicate, missing or unknown finding id');
  for (const j of judgments) if (j.flaw !== null && (!flaws.has(j.flaw) || j.real !== true)) throw new Error('judge flaw must belong to the selected plan and be real');
  return judgments;
}
export function checkedJudgeReply(reply, packet, keyEntry, schema) {
  if (!reply.ok) return reply;
  try { validateJudgments(reply.data?.judgments, packet, keyEntry, schema); return reply; }
  catch (e) { return { ...reply, ok: false, error: e.message }; }
}
export function validateReviewRecord(review, schema, truth, filename, phase) {
  if (!object(review) || typeof review.ok !== 'boolean' || !Object.hasOwn(truth.plans, review.plan) || !phase.plans.includes(review.plan) || !phase.families.includes(review.family) || !Number.isSafeInteger(review.run) || review.run < 1 || review.run > phase.runs || filename !== `${review.plan}.${review.family}.${review.run}.json`) throw new Error('invalid cached review identity/selection');
  requireSame(review.binding, reviewBinding(phase, review.plan, review.family, review.run), 'review binding');
  if (review.ok) validateContract({ verdict: review.verdict, findings: review.findings }, schema, 'cached review contract');
  return review;
}

const canonical = value => JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export function requireSame(actual, expected, label) {
  if (canonical(actual) !== canonical(expected)) throw new Error(`stale ${label} identity; preserve this output and use a new --out`);
}
function roleSettings(config, roles) {
  checkedConfig(config, roles);
  return Object.fromEntries([...roles].sort().map(role => [role, { enabled: true, model: config[role].model, effort: config[role].effort, ...(role === 'codex' ? { writeBackAuth: config[role].writeBackAuth ?? false } : {}) }]));
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function reviewPhase(frozen, config, selection) {
  const { plans, families, runs, timeout } = selection;
  if (!Array.isArray(plans) || !plans.length || plans.some(p => typeof p !== 'string') || new Set(plans).size !== plans.length || !Array.isArray(families) || !families.length || families.some(f => !['claude', 'codex'].includes(f)) || new Set(families).size !== families.length || !Number.isSafeInteger(runs) || runs < 1 || !Number.isFinite(timeout) || timeout <= 0) throw new Error('invalid review selection/settings identity');
  return { version: 1, freeze: frozen.id, plans: [...plans].sort(), families: [...families].sort(), runs, roles: roleSettings(config, families), timeout };
}
export function validateRunMeta(meta, frozen, truth) {
  if (!object(meta) || !object(meta.review)) throw new Error('incomplete run metadata/review identity');
  requireSame(meta.freeze, frozen.id, 'run freeze');
  requireSame(meta.review, reviewPhase(frozen, meta.review.roles, meta.review), 'review settings/freeze');
  if (meta.review.plans.some(p => !Object.hasOwn(truth.plans, p))) throw new Error('invalid review plan selection');
  if (meta.judge !== undefined) {
    if (!object(meta.judge)) throw new Error('invalid judge phase identity');
    requireSame(meta.judge, judgePhase(frozen, meta.judge.roles, meta.judge.timeout, meta.review), 'judge settings/freeze');
  }
  return meta;
}
export function reviewBinding(phase, plan, family, run) {
  return { phaseSha256: digest(phase), plan, family, run };
}
export function judgePhase(frozen, config, timeout, review) {
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('invalid judge settings timeout');
  return { version: 1, freeze: frozen.id, reviewSha256: digest(review), roles: roleSettings(config, ['claude', 'codex']), timeout };
}
export function judgeBinding(phase, plan, family, packet) {
  return { phase, plan, family, packetSha256: createHash('sha256').update(JSON.stringify(packet, null, 2) + '\n').digest('hex') };
}
export function boundJudgments(answer, binding, packet, keyEntry, schema) {
  if (!object(answer)) throw new Error('missing bound judge answer');
  requireSame(answer.binding, binding, 'judge packet/settings');
  return validateJudgments(answer.judgments, packet, keyEntry, schema);
}

export function localConfig(argv, fallback, roles) {
  const index = argv.indexOf('--config');
  if (argv.filter(a => a === '--config').length > 1) throw new Error('--config must occur once');
  if (index >= 0 && (!argv[index + 1] || argv[index + 1].startsWith('--'))) throw new Error('--config needs a local file');
  let config;
  try { config = JSON.parse(readFileSync(index >= 0 ? argv[index + 1] : fallback, 'utf8')); }
  catch { throw new Error('paid mode requires an explicit enabled local config with model and effort for every role'); }
  return checkedConfig(config, roles);
}
function checkedConfig(config, roles) {
  if (!object(config)) throw new Error('local config must be an object');
  for (const [role, spec] of Object.entries(config)) {
    if (!['claude', 'codex'].includes(role)) throw new Error(`unknown local config role: ${role}`);
    if (!object(spec)) throw new Error(`${role} config must be an object`);
    const fields = role === 'codex' ? ['enabled', 'model', 'effort', 'writeBackAuth'] : ['enabled', 'model', 'effort'];
    for (const key of Object.keys(spec)) if (!fields.includes(key)) throw new Error(`unknown ${role} config field: ${key}`);
    if (typeof spec.enabled !== 'boolean') throw new Error(`${role} enabled must be a boolean`);
    if (spec.writeBackAuth !== undefined && typeof spec.writeBackAuth !== 'boolean') throw new Error('writeBackAuth must be a boolean opt-in');
    if (spec.model !== undefined && typeof spec.model !== 'string') throw new Error(`${role} model must be a string`);
    if (spec.effort !== undefined && !['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(spec.effort)) throw new Error(`${role} requires an explicit effort`);
    if (spec.enabled === true) {
      if (typeof spec.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(spec.model) || spec.model.startsWith('CHOOSE_')) throw new Error(`${role} requires an explicit model`);
      if (spec.effort === undefined) throw new Error(`${role} requires an explicit effort`);
    }
  }
  for (const role of roles) if (config[role]?.enabled !== true) throw new Error(`${role} disabled: explicitly enable local config`);
  return config;
}
