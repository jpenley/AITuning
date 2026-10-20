/**
 * The part of the MCP integration that talks to servers: connections, transports, and OAuth
 * sign-in. It pulls in the MCP client, so index.ts loads it through runtime.lazy.ts only when a
 * server is configured.
 */

import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
	type AuthProvider,
	type CallToolResult,
	JSON_RPC_ERROR_CODES,
	type ListResourcesResult,
	type ListResourceTemplatesResult,
	McpAuthRequiredError,
	McpClient,
	McpError,
	McpHttpError,
	type McpRequestOptions,
	McpSessionExpiredError,
	type Tool as McpTool,
	type McpTransport,
	type ReadResourceResult,
	type Resource,
	type ResourceTemplate,
	StdioTransport,
	StreamableHttpTransport,
} from "@earendil-works/pi-mcp";
import { McpOAuthAuthorizationRequiredError, type OAuthChallenge } from "@earendil-works/pi-mcp/oauth";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { resolveConfigValueOrThrow, resolveHeadersOrThrow } from "../support/resolve-config-value.ts";
import { reportMcpDiagnostic } from "../support/diagnostics.ts";
import type { McpServerEntry } from "./config.ts";
import { type McpElicitationHost, McpElicitationScopes, type McpOperationContext } from "./elicitation.ts";
import type { McpServerLog } from "./log.ts";
import {
	createMcpAuthProvider,
	type McpAuthProvider,
	type McpCredentialStore,
	type McpOAuthSettings,
} from "./oauth.ts";
import type { McpResourceServer } from "./resources.ts";
import type { McpToolCaller } from "./tools.ts";

export { McpServerLog } from "./log.ts";
export { McpOAuthCredentialStore, McpSignInCancelledError, signInMcpServer } from "./oauth.ts";

const DEFAULT_TIMEOUT_SECONDS = 60;
const STDERR_TAIL_CHARS = 2_000;
/** Delays between attempts to connect to an HTTP server that failed with a transient error. */
const CONNECT_RETRY_DELAYS_MS = [250, 1_000];

/**
 * `disconnected`: the connection dropped (for example the stdio server exited); the next call
 * reconnects.
 */
type ServerState = "connecting" | "connected" | "disconnected" | "needs-auth" | "failed" | "closed";

export type McpTransportFactory = (
	entry: McpServerEntry,
	cwd: string,
	authProvider: AuthProvider | undefined,
) => McpTransport;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Network failures and overloaded or restarting servers, which are worth another attempt. */
function isTransientError(error: unknown): boolean {
	if (error instanceof McpHttpError) {
		return error.status === 408 || error.status === 429 || (error.status >= 500 && error.status !== 501);
	}
	return error instanceof TypeError;
}

function signInRequiredMessage(entry: McpServerEntry): string {
	const provider = "url" in entry.config ? entry.config.auth?.provider : undefined;
	return `MCP server "${entry.name}" requires sign-in. Run ${provider ? `/login ${provider}` : "/mcp"} to sign in.`;
}

/** HTTP servers authenticate with OAuth unless the config supplies an `Authorization` header or `auth`. */
function usesOAuth(entry: McpServerEntry): boolean {
	const { config } = entry;
	if (!("url" in config) || config.auth) return false;
	return !Object.keys(config.headers ?? {}).some((header) => header.toLowerCase() === "authorization");
}

/** `~` and `~/…` (also `~\…` on Windows) name the home directory, like in a shell. */
function expandHome(value: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/") || (process.platform === "win32" && value.startsWith("~\\"))) {
		return join(homedir(), value.slice(2));
	}
	return value;
}

export function createDefaultTransport(
	entry: McpServerEntry,
	cwd: string,
	authProvider: AuthProvider | undefined,
): McpTransport {
	const { config, name } = entry;
	if ("url" in config) {
		return new StreamableHttpTransport({
			url: config.url,
			headers: resolveHeadersOrThrow(config.headers, `MCP server "${name}"`),
			authProvider,
		});
	}
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(config.env ?? {})) {
		env[key] = resolveConfigValueOrThrow(value, `MCP server "${name}" env "${key}"`);
	}
	return new StdioTransport({
		command: expandHome(config.command),
		args: config.args?.map(expandHome),
		cwd: resolve(cwd, expandHome(config.cwd ?? ".")),
		env,
		stderr: "pipe",
	});
}

/** Servers that do not implement `resources/templates/list` have no templates. */
async function withoutTemplates<T>(list: () => Promise<T>, empty: T): Promise<T> {
	try {
		return await list();
	} catch (error) {
		if (error instanceof McpError && error.code === JSON_RPC_ERROR_CODES.methodNotFound) return empty;
		throw error;
	}
}

function listTemplates(client: McpClient, options: McpRequestOptions = {}): Promise<ResourceTemplate[]> {
	return withoutTemplates(() => client.listResourceTemplates(options), []);
}

/** One configured server. Reconnects lazily when a call finds the connection gone. */
export class McpServerConnection implements McpToolCaller, McpResourceServer {
	readonly entry: McpServerEntry;
	state: ServerState = "connecting";
	error: string | undefined;
	tools: McpTool[] = [];
	/**
	 * Whether the server offers resources, which the resource tools list and read on demand. They are
	 * not listed at connect: listing every resource can take long (a large drive, say).
	 */
	hasResources = false;
	/** Server instructions from `initialize`, describing its tools as a group. */
	instructions: string | undefined;
	/** Last OAuth challenge from the server; sign-in uses its resource metadata URL and scope. */
	challenge: OAuthChallenge | undefined;
	private client: McpClient | undefined;
	private opening: Promise<McpClient> | undefined;
	private signingOut: Promise<boolean> | undefined;
	/** Logout cancels setup/backoff without changing ordinary reconnect's native wait. */
	private setup = new AbortController();
	private readonly credentials: McpCredentialStore;
	/** Aborted by `close()`; cancels a connect in progress, including the wait between retries. */
	private readonly shutdown = new AbortController();
	/** Stderr of the last stdio server that failed to connect. */
	private stderrTail: string | undefined;
	private readonly cwd: string;
	private readonly createTransport: McpTransportFactory;
	private readonly authProvider: McpAuthProvider | undefined;
	private readonly onTools: (connection: McpServerConnection) => void;
	private readonly onChange: ((connection: McpServerConnection) => void) | undefined;
	private readonly log: McpServerLog | undefined;
	private readonly elicitation: McpElicitationScopes | undefined;
	private elicitationEnabled = false;
	private generation = new AbortController();

	constructor(options: {
		entry: McpServerEntry;
		cwd: string;
		createTransport: McpTransportFactory;
		credentials: McpCredentialStore;
		/** The current token of a pi provider, for servers with `auth.provider`. */
		providerToken?: (provider: string) => Promise<string | undefined>;
		onTools: (connection: McpServerConnection) => void;
		/** Called when `state`, `error`, or `tools` change. */
		onChange?: (connection: McpServerConnection) => void;
		/** Receives the server's log messages (`notifications/message`). */
		log?: McpServerLog;
		elicitation?: McpElicitationHost;
	}) {
		this.entry = options.entry;
		this.credentials = options.credentials;
		this.cwd = options.cwd;
		this.createTransport = options.createTransport;
		this.onTools = options.onTools;
		this.onChange = options.onChange;
		this.log = options.log;
		this.elicitation = options.elicitation ? new McpElicitationScopes(options.elicitation) : undefined;
		const url = this.oauthUrl;
		const provider = "url" in this.entry.config ? this.entry.config.auth?.provider : undefined;
		this.authProvider = url
			? createMcpAuthProvider({
					serverUrl: url,
					store: options.credentials.forServer(this.entry.name, url),
					settings: () => this.oauthSettings(),
					onChallenge: (challenge) => {
						this.challenge = challenge;
					},
				})
			: provider
				? // Read on every request, so the provider's refreshes apply; MCP stores no copy.
					{ token: async () => options.providerToken?.(provider), settled: async () => {} }
				: undefined;
	}

	get name(): string {
		return this.entry.name;
	}

	private get closed(): boolean {
		return this.shutdown.signal.aborted;
	}

	get timeoutMs(): number {
		return (this.entry.config.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
	}

	/** Server URL when the server authenticates with OAuth. */
	get oauthUrl(): string | undefined {
		return usesOAuth(this.entry) && "url" in this.entry.config ? this.entry.config.url : undefined;
	}

	oauthSettings(): McpOAuthSettings {
		const oauth = "url" in this.entry.config ? this.entry.config.oauth : undefined;
		if (!oauth) return {};
		return {
			clientId: oauth.clientId,
			clientSecret:
				oauth.clientSecret === undefined
					? undefined
					: resolveConfigValueOrThrow(oauth.clientSecret, `MCP server "${this.entry.name}" oauth.clientSecret`),
			callbackPort: oauth.callbackPort,
			callbackUrl: oauth.callbackUrl,
			scope: oauth.scope,
			clientName: oauth.clientName,
			clientRegistration: oauth.clientRegistration,
			authServerMetadataUrl: oauth.authServerMetadataUrl ? new URL(oauth.authServerMetadataUrl) : undefined,
		};
	}

	get isSigningOut(): boolean {
		return this.signingOut !== undefined;
	}

	getClient(): Promise<McpClient> {
		if (this.closed) return Promise.reject(new Error(`MCP server "${this.entry.name}" is shut down`));
		if (this.signingOut) return Promise.reject(new Error(`MCP server "${this.entry.name}" is signing out`));
		if (this.client?.connectionState === "connected") return Promise.resolve(this.client);
		this.opening ??= this.open().finally(() => {
			this.opening = undefined;
		});
		return this.opening;
	}

	callTool(
		name: string,
		args: Record<string, unknown>,
		options: McpRequestOptions,
		operation?: McpOperationContext,
	): Promise<CallToolResult> {
		return this.withClient((client) => client.callTool(name, args, options), false, options, operation);
	}

	readResource(uri: string, options: McpRequestOptions): Promise<ReadResourceResult> {
		return this.withClient((client) => client.readResource(uri, options), true, options);
	}

	resourcesPage(cursor: string | undefined, options: McpRequestOptions): Promise<ListResourcesResult> {
		return this.withClient((client) => client.listResourcesPage(cursor, options), true, options);
	}

	resourceTemplatesPage(cursor: string | undefined, options: McpRequestOptions): Promise<ListResourceTemplatesResult> {
		return this.withClient(
			(client) =>
				withoutTemplates(() => client.listResourceTemplatesPage(cursor, options), { resourceTemplates: [] }),
			true,
			options,
		);
	}

	allResources(options: McpRequestOptions): Promise<Resource[]> {
		return this.withClient((client) => client.listResources(options), true, options);
	}

	allResourceTemplates(options: McpRequestOptions): Promise<ResourceTemplate[]> {
		return this.withClient((client) => listTemplates(client, options), true, options);
	}

	/**
	 * Run a request, reconnecting when needed. `readOnly` requests are retried once after a transient
	 * HTTP error; tool calls are not, since they may have run.
	 */
	private async withClient<T>(
		run: (client: McpClient) => Promise<T>,
		readOnly = false,
		options: McpRequestOptions = {},
		operation?: McpOperationContext,
	): Promise<T> {
		if (this.signingOut) throw new Error(`MCP server "${this.name}" is signing out.`);
		// Capture cancellation before discovery/queue awaits, never from a newer logout lifetime.
		const signals = [this.shutdown.signal, this.generation.signal, this.setup.signal];
		if (options.signal) signals.push(options.signal);
		if (operation?.ctx.signal) signals.push(operation.ctx.signal);
		if (this.elicitation) signals.push(this.elicitation.host.signal);
		const signal = AbortSignal.any(signals);
		signal.throwIfAborted();
		// Initial discovery finishes before a scope can become eligible.
		await this.getClient();
		signal.throwIfAborted();
		const execute = () => this.requestWithClient(run, readOnly, signal, operation);
		return this.elicitationEnabled && this.elicitation ? this.elicitation.run(signal, execute) : execute();
	}

	private async requestWithClient<T>(
		run: (client: McpClient) => Promise<T>,
		readOnly: boolean,
		signal: AbortSignal,
		operation?: McpOperationContext,
	): Promise<T> {
		for (let attempt = 1; ; attempt++) {
			signal.throwIfAborted();
			const client = await this.getClient();
			await operation?.validate?.();
			signal.throwIfAborted();
			try {
				return this.elicitationEnabled && this.elicitation
					? await this.elicitation.scope(client, operation, signal, () => run(client))
					: await run(client);
			} catch (error) {
				if (readOnly && attempt === 1 && error instanceof McpHttpError && isTransientError(error)) {
					await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAYS_MS[0]));
					continue;
				}
				if (error instanceof McpSessionExpiredError && attempt === 1) {
					// The server no longer knows the session (restart, deploy), so it did not run the request.
					// Retry once on a new session. The old client is detached but not closed: closing would
					// fail its other in-flight calls, which instead get the same 404 and retry the same way.
					if (this.client === client) this.client = undefined;
					continue;
				}
				if (!this.needsSignIn(error)) throw error;
				await this.dropClient(client);
				this.markNeedsAuth();
				throw new Error(signInRequiredMessage(this.entry));
			}
		}
	}

	/** Connect again with fresh credentials, for example after signing in. */
	async reconnect(): Promise<void> {
		if (this.signingOut) throw new Error(`MCP server "${this.name}" is signing out.`);
		// A detached close can outlive logout; retain the admitted setup lifetime.
		const signal = this.setup.signal;
		this.generation.abort();
		this.generation = new AbortController();
		await this.opening?.catch((error: unknown) => reportMcpDiagnostic("previous connection attempt failed before reconnect", error));
		signal.throwIfAborted();
		if (this.client) await this.dropClient(this.client);
		signal.throwIfAborted();
		await this.getClient();
	}

	/** Disconnect, drain rotated-token saves, then delete under the native refresh lock. */
	signOut(): Promise<boolean> {
		if (this.signingOut) return this.signingOut;
		// Publish the barrier before abort listeners can reenter the connection.
		const result = Promise.withResolvers<boolean>();
		this.signingOut = result.promise;
		void (async () => {
			this.setup.abort();
			this.setup = new AbortController();
			this.generation.abort();
			this.generation = new AbortController();
			await this.opening?.catch((error: unknown) => reportMcpDiagnostic("previous connection attempt failed before sign-out", error));
			if (this.client) await this.dropClient(this.client);
			await this.authProvider?.settled();
			const url = this.oauthUrl;
			const removed = url
				? await this.credentials.forServer(this.entry.name, url).withRefreshLock(async () => this.credentials.remove(this.entry.name, url))
				: false;
			// Publish needs-auth only after deletion, so external-sign-in detection snapshots null.
			if (!this.closed) this.markNeedsAuth();
			return removed;
		})().then(
			(removed) => { this.signingOut = undefined; result.resolve(removed); },
			(error: unknown) => { this.signingOut = undefined; result.reject(error); },
		);
		return result.promise;
	}

	/** OAuth servers that still reject the request after a refresh need the user to sign in again. */
	private needsSignIn(error: unknown): boolean {
		return (
			error instanceof McpOAuthAuthorizationRequiredError ||
			(this.authProvider !== undefined && error instanceof McpAuthRequiredError)
		);
	}

	private markNeedsAuth(): void {
		this.state = "needs-auth";
		this.error = undefined;
		this.changed();
	}

	private changed(): void {
		this.onChange?.(this);
	}

	private async dropClient(client: McpClient): Promise<void> {
		if (this.client === client) this.client = undefined;
		await client.close().catch((error: unknown) => reportMcpDiagnostic("transport close failed", error));
	}

	private async open(): Promise<McpClient> {
		const signal = AbortSignal.any([this.shutdown.signal, this.setup.signal]);
		this.state = "connecting";
		this.changed();
		const retries = "url" in this.entry.config ? CONNECT_RETRY_DELAYS_MS : [];
		for (let attempt = 0; ; attempt++) {
			this.stderrTail = undefined;
			try {
				signal.throwIfAborted();
				if (this.signingOut) throw new Error("signing out while connecting");
				return await this.connectOnce(signal);
			} catch (error) {
				if (!this.closed && (signal.aborted || this.signingOut)) throw error;
				const delay = retries[attempt];
				if (this.closed || delay === undefined || !isTransientError(error)) {
					throw this.connectFailed(error);
				}
				await sleep(delay, undefined, { signal }).catch((error: unknown) => {
					if (!signal.aborted) throw error;
					// Expected shutdown cancellation; connectFailed below records the final state.
				});
				if (this.closed) throw this.connectFailed(error);
			}
		}
	}

	private async connectOnce(signal: AbortSignal): Promise<McpClient> {
		const elicitation = this.elicitation;
		const enabled = elicitation?.host.available() === true;
		this.elicitationEnabled = enabled;
		const generation = this.generation;
		const client = new McpClient({
			name: "pi",
			version: VERSION,
			requestTimeoutMs: this.timeoutMs,
			...(enabled ? { capabilities: { elicitation: { form: {} } } } : {}),
			roots: [{ uri: pathToFileURL(this.cwd).href, name: basename(this.cwd) }],
		});
		if (enabled && elicitation) {
			client.setRequestHandler("elicitation/create", (params, { signal }) =>
				elicitation.dispatch(
					client,
					params,
					signal,
					AbortSignal.any([this.shutdown.signal, generation.signal]),
					this.entry.name,
					this.entry.source,
				),
			);
		}
		const log = this.log;
		if (log) client.onNotification("notifications/message", (params) => log.write(this.entry.name, params));
		// Closing the client fails its pending initialize or discovery requests and closes the transport.
		// Memoized: a second `client.close()` returns before the first finished closing the transport.
		let closing: Promise<void> | undefined;
		const closeClient = () => {
			closing ??= client.close().catch((error: unknown) => reportMcpDiagnostic("connecting transport close failed", error));
			return closing;
		};
		signal.addEventListener("abort", closeClient, { once: true });
		let transport: McpTransport | undefined;
		try {
			signal.throwIfAborted();
			if (this.signingOut) throw new Error("signing out while connecting");
			transport = this.createTransport(this.entry, this.cwd, this.authProvider);
			await client.connect(transport);
			signal.throwIfAborted();
			if (this.signingOut) throw new Error("signing out while connecting");
			client.onNotification("notifications/tools/list_changed", () => {
				if (!signal.aborted && !this.signingOut) void this.refreshTools(client);
			});
			const stdio = transport instanceof StdioTransport ? transport : undefined;
			client.onClose(() => this.handleClientClose(client, stdio));
			// Servers without the tools capability (prompts or resources only) do not answer tools/list.
			const tools = client.serverCapabilities?.tools ? await client.listTools() : [];
			if (this.closed) throw new Error("shut down while connecting");
			signal.throwIfAborted();
			if (this.signingOut) throw new Error("signing out while connecting");
			if (client.connectionState !== "connected") throw new Error("connection closed during setup");
			this.client = client;
			this.tools = tools;
			this.hasResources = client.serverCapabilities?.resources !== undefined;
			this.instructions = client.instructions?.trim() || undefined;
			this.state = "connected";
			this.error = undefined;
			this.onTools(this);
			this.changed();
			return client;
		} catch (error) {
			await closeClient();
			if (transport instanceof StdioTransport) {
				this.stderrTail = transport.stderr.trim().slice(-STDERR_TAIL_CHARS) || undefined;
			}
			throw error;
		} finally {
			signal.removeEventListener("abort", closeClient);
		}
	}

	private connectFailed(error: unknown): Error {
		if (this.needsSignIn(error) && !this.closed) {
			this.markNeedsAuth();
			return new Error(signInRequiredMessage(this.entry));
		}
		this.state = this.closed ? "closed" : "failed";
		this.error = this.stderrTail ? `${errorMessage(error)}\n${this.stderrTail}` : errorMessage(error);
		this.changed();
		return new Error(`MCP server "${this.entry.name}" failed to connect: ${this.error}`);
	}

	/** The transport dropped. The next call reconnects; until then the status shows why. */
	private handleClientClose(client: McpClient, stdio: StdioTransport | undefined): void {
		if (this.client !== client || this.closed) return;
		this.generation.abort();
		this.generation = new AbortController();
		this.client = undefined;
		this.state = "disconnected";
		const stderr = stdio?.stderr.trim().slice(-STDERR_TAIL_CHARS);
		this.error = stderr ? `Connection closed\n${stderr}` : "Connection closed";
		this.changed();
	}

	private async refreshTools(client: McpClient): Promise<void> {
		try {
			const list = () => client.listTools();
			const tools =
				this.elicitationEnabled && this.elicitation
					? await this.elicitation.run(
							AbortSignal.any([this.shutdown.signal, this.generation.signal, this.elicitation.host.signal]),
							list,
						)
					: await list();
			if (this.client !== client || this.closed || this.signingOut) return;
			this.tools = tools;
			this.onTools(this);
		} catch (error) {
			if (this.client !== client || this.closed || this.signingOut) return;
			this.error = `Failed to refresh tools: ${errorMessage(error)}`;
		}
		this.changed();
	}

	/** Resolves once no transport of this server is open, including one that was still connecting. */
	async close(): Promise<void> {
		this.shutdown.abort();
		this.state = "closed";
		this.changed();
		const client = this.client;
		this.client = undefined;
		await Promise.all([
			client?.close().catch((error: unknown) => reportMcpDiagnostic("shutdown transport close failed", error)),
			this.opening?.catch((error: unknown) => reportMcpDiagnostic("connection attempt failed during shutdown", error)),
		]);
		// A refresh the server already answered may have rotated the refresh token; exiting before the
		// new tokens are saved would lose the grant.
		await this.authProvider?.settled();
	}
}
