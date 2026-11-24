/**
 * Native-derived synchronous credential persistence, restricted to the MCP OAuth store's needs.
 * This is not a provider credential store or an authentication/model registry.
 * See PROVENANCE.md for the upstream source and license.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { normalizePath } from "./paths.ts";

type LockResult<T> = { result: T; next?: string };

/** Structural seam: native backends with additional async operations remain compatible. */
export interface AuthStorageBackend {
	withLock<T>(fn: (current: string | undefined) => LockResult<T>): T;
}

function getRetryableLockErrorCode(error: unknown): "ELOCKED" | "EPERM" | undefined {
	const code = error instanceof Error && "code" in error ? error.code : undefined;
	if (code === "ELOCKED") return code;
	if (code === "EPERM" && process.platform === "win32") return code;
	return undefined;
}

// Creation mode only: retain administrator-managed permissions and ACLs on existing files.
const AUTH_FILE_WRITE_OPTIONS = { encoding: "utf-8", mode: 0o600 } as const;

export class FileAuthStorageBackend implements AuthStorageBackend {
	private readonly authPath: string;

	constructor(authPath: string) {
		this.authPath = normalizePath(authPath);
	}

	private ensureParentDir(): void {
		const dir = dirname(this.authPath);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	}

	private ensureFileExists(): void {
		if (!existsSync(this.authPath)) writeFileSync(this.authPath, "{}", AUTH_FILE_WRITE_OPTIONS);
	}

	private acquireLockSyncWithRetry(path: string): () => void {
		const maxAttempts = 10;
		const delayMs = 20;
		for (let attempt = 1; ; attempt++) {
			try {
				return lockfile.lockSync(path, { realpath: false });
			} catch (error) {
				if (!getRetryableLockErrorCode(error) || attempt === maxAttempts) throw error;
				const start = Date.now();
				while (Date.now() - start < delayMs) {
					// Native bounded synchronous retry, preserving the synchronous store contract.
				}
			}
		}
	}

	withLock<T>(fn: (current: string | undefined) => LockResult<T>): T {
		this.ensureParentDir();
		this.ensureFileExists();
		let release: (() => void) | undefined;
		try {
			release = this.acquireLockSyncWithRetry(this.authPath);
			const current = existsSync(this.authPath) ? readFileSync(this.authPath, "utf-8") : undefined;
			const { result, next } = fn(current);
			if (next !== undefined) writeFileSync(this.authPath, next, AUTH_FILE_WRITE_OPTIONS);
			return result;
		} finally {
			if (release) release();
		}
	}
}
