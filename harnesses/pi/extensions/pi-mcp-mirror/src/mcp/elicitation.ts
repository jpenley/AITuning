import { McpError } from "@earendil-works/pi-mcp";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";

export const ELICITATION_TOOL = "mcp_elicitation_v1";
type ObjectValue = Record<string, unknown>;
type Check = (value: unknown) => boolean;

function object(value: unknown): value is ObjectValue {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	);
}

function invalid(): never {
	throw new McpError(-32602, "Unsupported or invalid form elicitation request");
}

export function elicitationFailure(): McpError {
	return new McpError(-32603, "Form elicitation unavailable or failed");
}

function keys(value: ObjectValue, allowed: string[]): void {
	if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}

/** Bound JSON bytes and every string (including property names), without interpreting human text. */
function bounded(value: unknown, maxBytes = 65_536): boolean {
	try {
		const json = JSON.stringify(value);
		if (json === undefined || Buffer.byteLength(json, "utf8") > maxBytes) return false;
		const visit = (item: unknown): boolean => {
			if (typeof item === "string") return [...item].length <= 8192;
			if (Array.isArray(item)) return item.every(visit);
			if (object(item)) return Object.entries(item).every(([key, child]) => visit(key) && visit(child));
			return item === null || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item));
		};
		return visit(value);
	} catch {
		return false;
	}
}

function annotation(schema: ObjectValue): void {
	for (const key of ["title", "description"]) {
		if (schema[key] !== undefined && typeof schema[key] !== "string") invalid();
	}
}

function limit(schema: ObjectValue, name: string, integer: boolean): number | undefined {
	const value = schema[name];
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value) || (integer && (!Number.isSafeInteger(value) || value < 0)))
		invalid();
	return value;
}

function choices(schema: ObjectValue, variant: "oneOf" | "anyOf"): string[] | undefined {
	if (schema.enum !== undefined) {
		if (schema[variant] !== undefined || !Array.isArray(schema.enum)) invalid();
		const values = schema.enum;
		if (
			values.length === 0 ||
			values.length > 128 ||
			values.some((value) => typeof value !== "string") ||
			new Set(values).size !== values.length
		)
			invalid();
		if (
			schema.enumNames !== undefined &&
			(!Array.isArray(schema.enumNames) ||
				schema.enumNames.length !== values.length ||
				schema.enumNames.some((name) => typeof name !== "string"))
		)
			invalid();
		return values as string[];
	}
	if (schema.enumNames !== undefined) invalid();
	if (schema[variant] === undefined) return undefined;
	const entries = schema[variant];
	if (!Array.isArray(entries) || entries.length === 0 || entries.length > 128) invalid();
	const values = entries.map((entry) => {
		if (!object(entry)) invalid();
		keys(entry, ["const", "title"]);
		if (typeof entry.const !== "string" || typeof entry.title !== "string") invalid();
		return entry.const;
	});
	if (new Set(values).size !== values.length) invalid();
	return values;
}

function formatted(value: string, format: unknown): boolean {
	if (format === undefined) return true;
	if (format === "email") {
		const parts = value.split("@");
		return (
			parts.length === 2 &&
			parts[0].length > 0 &&
			!/\s/u.test(value) &&
			parts[1].includes(".") &&
			!parts[1].startsWith(".") &&
			!parts[1].endsWith(".")
		);
	}
	if (format === "uri") {
		return (
			URL.canParse(value) &&
			!/[^\x21-\x7e]/.test(value) &&
			!/[<>"{}|\\^`]/.test(value) &&
			!/%(?![a-f0-9]{2})/i.test(value)
		);
	}
	const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(format === "date" ? value : value.slice(0, 10));
	if (!date) return false;
	const parsed = new Date(`${date[0]}T00:00:00Z`);
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date[0]) return false;
	return (
		format === "date" ||
		(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.test(
			value,
		) &&
			Number.isFinite(Date.parse(value)))
	);
}

function field(schema: unknown): Check {
	if (!object(schema)) invalid();
	annotation(schema);
	if (!Object.hasOwn(schema, "type")) invalid();
	const common = ["type", "title", "description", "default"];
	let check: Check;
	switch (schema.type) {
		case "boolean":
			keys(schema, common);
			check = (value) => typeof value === "boolean";
			break;
		case "string": {
			keys(schema, [...common, "minLength", "maxLength", "format", "enum", "enumNames", "oneOf"]);
			const min = limit(schema, "minLength", true) ?? 0;
			const max = limit(schema, "maxLength", true) ?? 8192;
			if (
				min > max ||
				min > 8192 ||
				max > 8192 ||
				(schema.format !== undefined &&
					(typeof schema.format !== "string" || !["email", "uri", "date", "date-time"].includes(schema.format)))
			)
				invalid();
			const values = choices(schema, "oneOf");
			check = (value) =>
				typeof value === "string" &&
				[...value].length >= min &&
				[...value].length <= max &&
				(!values || values.includes(value)) &&
				formatted(value, schema.format);
			if (values?.some((value) => !check(value))) invalid();
			break;
		}
		case "number":
		case "integer": {
			keys(schema, [...common, "minimum", "maximum"]);
			const min = limit(schema, "minimum", false) ?? -Number.MAX_SAFE_INTEGER;
			const max = limit(schema, "maximum", false) ?? Number.MAX_SAFE_INTEGER;
			if (
				min > max ||
				Math.abs(min) > Number.MAX_SAFE_INTEGER ||
				Math.abs(max) > Number.MAX_SAFE_INTEGER ||
				(schema.type === "integer" &&
					[schema.minimum, schema.maximum].some((value) => value !== undefined && !Number.isSafeInteger(value)))
			)
				invalid();
			check = (value) =>
				typeof value === "number" &&
				Number.isFinite(value) &&
				Math.abs(value) <= Number.MAX_SAFE_INTEGER &&
				value >= min &&
				value <= max &&
				(schema.type !== "integer" || Number.isSafeInteger(value));
			break;
		}
		case "array": {
			keys(schema, [...common, "items", "minItems", "maxItems"]);
			if (!object(schema.items)) invalid();
			keys(schema.items, ["type", "enum", "enumNames", "anyOf"]);
			if (
				schema.items.type !== "string" &&
				!(schema.items.type === undefined && Object.hasOwn(schema.items, "anyOf"))
			)
				invalid();
			const values = choices(schema.items, "anyOf");
			if (!values) invalid();
			const min = limit(schema, "minItems", true) ?? 0;
			const max = limit(schema, "maxItems", true) ?? 128;
			if (min > max || min > 128 || max > 128 || min > values.length) invalid();
			check = (value) =>
				Array.isArray(value) &&
				value.length >= min &&
				value.length <= max &&
				new Set(value).size === value.length &&
				value.every((item) => typeof item === "string" && values.includes(item));
			break;
		}
		default:
			invalid();
	}
	if (Object.hasOwn(schema, "default") && !check(schema.default)) invalid();
	return check;
}

export function validateElicitationRequest(params: unknown): {
	request: { mode?: "form"; message: string; requestedSchema: ObjectValue };
	validateContent: Check;
} {
	if (!object(params) || !bounded(params)) invalid();
	keys(params, ["mode", "message", "requestedSchema", "_meta"]);
	if (
		!Object.hasOwn(params, "message") ||
		!Object.hasOwn(params, "requestedSchema") ||
		(params.mode !== undefined && params.mode !== "form") ||
		typeof params.message !== "string" ||
		!object(params.requestedSchema)
	)
		invalid();
	const schema = params.requestedSchema;
	keys(schema, [
		"type",
		"title",
		"description",
		"properties",
		"required",
		"additionalProperties",
		"default",
		"$schema",
	]);
	if (
		schema.$schema !== undefined &&
		(typeof schema.$schema !== "string" ||
			!["https://json-schema.org/draft/2020-12/schema", "http://json-schema.org/draft-07/schema#"].includes(
				schema.$schema,
			))
	)
		invalid();
	annotation(schema);
	if (
		!Object.hasOwn(schema, "type") ||
		!Object.hasOwn(schema, "properties") ||
		schema.type !== "object" ||
		!object(schema.properties) ||
		Object.keys(schema.properties).length > 32 ||
		(schema.additionalProperties !== undefined && schema.additionalProperties !== false)
	)
		invalid();
	const checks = new Map(Object.entries(schema.properties).map(([key, value]) => [key, field(value)]));
	const required = schema.required === undefined ? [] : schema.required;
	if (
		!Array.isArray(required) ||
		required.some((key) => typeof key !== "string" || !checks.has(key)) ||
		new Set(required).size !== required.length
	)
		invalid();
	const validateContent: Check = (value) =>
		object(value) &&
		bounded(value) &&
		required.every((key) => Object.hasOwn(value, key)) &&
		Object.entries(value).every(([key, item]) => checks.get(key)?.(item) === true);
	if (Object.hasOwn(schema, "default") && !validateContent(schema.default)) invalid();
	return {
		request: {
			...(params.mode === "form" ? { mode: "form" } : {}),
			message: params.message,
			requestedSchema: JSON.parse(JSON.stringify(schema)) as ObjectValue,
		},
		validateContent,
	};
}

export function validateElicitationResponse(
	value: unknown,
	validateContent: Check,
): { action: "accept" | "decline" | "cancel"; content?: ObjectValue } {
	if (
		!object(value) ||
		!Object.hasOwn(value, "action") ||
		!bounded(value, 65_536 + 64) ||
		Object.keys(value).some((key) => key !== "action" && key !== "content")
	)
		throw elicitationFailure();
	if (value.action === "decline" || value.action === "cancel") return { action: value.action };
	if (
		value.action !== "accept" ||
		!Object.hasOwn(value, "content") ||
		!validateContent(value.content) ||
		!object(value.content)
	)
		throw elicitationFailure();
	// JSON round-trip keeps own __proto__ fields without invoking a prototype setter.
	return { action: "accept", content: JSON.parse(JSON.stringify(value.content)) as ObjectValue };
}

/** A race that observes late failures and always removes its abort listener. */
export async function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	let abort: (() => void) | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<never>((_resolve, reject) => {
				abort = () => reject(elicitationFailure());
				if (signal.aborted) abort();
				else signal.addEventListener("abort", abort, { once: true });
			}),
		]);
	} finally {
		if (abort) signal.removeEventListener("abort", abort);
	}
}

export interface McpOperationContext {
	ctx: ExtensionToolContext;
	toolCallId: string;
	toolName: string;
	validate?: () => Promise<void>;
}

export interface McpElicitationHost {
	signal: AbortSignal;
	available: () => boolean;
}

/** Transport callbacks have no parent association. Only a serialized, live operation owns them. */
export class McpElicitationScopes {
	private tail: Promise<void> = Promise.resolve();
	private active: { operation: McpOperationContext; signal: AbortSignal; owner: object } | undefined;
	readonly host: McpElicitationHost;

	constructor(host: McpElicitationHost) {
		this.host = host;
	}

	async run<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
		const previous = this.tail;
		const work = (async () => {
			await untilAborted(previous, signal);
			signal.throwIfAborted();
			return run();
		})();
		this.tail = Promise.allSettled([previous, work]).then(() => undefined);
		return work;
	}

	async scope<T>(
		owner: object,
		operation: McpOperationContext | undefined,
		signal: AbortSignal,
		run: () => Promise<T>,
	): Promise<T> {
		const lifetime = new AbortController();
		const combined = AbortSignal.any([signal, lifetime.signal]);
		if (operation) this.active = { operation, signal: combined, owner };
		try {
			combined.throwIfAborted();
			return await untilAborted(run(), combined);
		} finally {
			this.active = undefined;
			lifetime.abort();
		}
	}

	async dispatch(
		owner: object,
		params: unknown,
		inbound: AbortSignal,
		connection: AbortSignal,
		server: string,
		source: string,
	): Promise<unknown> {
		const { request, validateContent } = validateElicitationRequest(params);
		const scope = this.active;
		if (!scope || scope.owner !== owner) throw elicitationFailure();
		const signal = AbortSignal.any([scope.signal, inbound, connection, this.host.signal]);
		const available = () =>
			!signal.aborted &&
			this.active === scope &&
			this.host.available() &&
			scope.operation.ctx.hasUI &&
			scope.operation.ctx.tools.some((tool) => tool.name === ELICITATION_TOOL);
		if (!available()) throw elicitationFailure();
		try {
			const outcome = await untilAborted(
				scope.operation.ctx.executeTool(ELICITATION_TOOL, { server, source, request }, { signal }),
				signal,
			);
			if (!available() || outcome.isError || outcome.result.isError) throw elicitationFailure();
			return validateElicitationResponse(outcome.result.structuredContent, validateContent);
		} catch {
			throw elicitationFailure();
		}
	}
}
