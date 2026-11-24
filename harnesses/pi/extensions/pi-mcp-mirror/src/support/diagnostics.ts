/**
 * Report operational failures without logging server text, URLs, credentials, or form answers.
 * Callers supply only fixed, developer-owned operation labels. Native recovery paths continue
 * after reporting; expected protocol failures still use their native result/state semantics.
 */
export function reportMcpDiagnostic(operation: string, error: unknown): void {
	const codes = ["ENOENT", "EACCES", "EPERM", "ELOCKED", "ECOMPROMISED", "ETIMEDOUT", "ECONNRESET"];
	const code = error instanceof Error && "code" in error && typeof error.code === "string" && codes.includes(error.code)
		? ` (${error.code})`
		: "";
	process.emitWarning(`MCP mirror: ${operation}${code}`, { code: "PI_MCP_MIRROR" });
}
