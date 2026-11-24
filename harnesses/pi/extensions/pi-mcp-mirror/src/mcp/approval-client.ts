import type { McpClient, McpRequestOptions, McpTimeoutError } from "@earendil-works/pi-mcp";

type Deadline = { pause: () => void; resume: () => void };

/** Own the active-time deadline through public APIs; never mutate SDK internals. */
export function createApprovalClient(Base: typeof McpClient, Timeout: typeof McpTimeoutError, now = () => performance.now()) {
  return class ApprovalClient extends Base {
    private humanWaits = 0;
    private readonly deadlines = new Set<Deadline>();

    async withHumanWait<T>(run: () => Promise<T>): Promise<T> {
      this.humanWaits++;
      if (this.humanWaits === 1) for (const deadline of this.deadlines) deadline.pause();
      try { return await run(); }
      finally {
        this.humanWaits--;
        if (this.humanWaits === 0) for (const deadline of this.deadlines) deadline.resume();
      }
    }

    override async request<Result = unknown>(method: string, params?: Record<string, unknown>, options: McpRequestOptions = {}): Promise<Result> {
      const timeoutMs = options.timeoutMs ?? this.options.requestTimeoutMs ?? 60_000;
      // Preserve explicit upstream no-timeout semantics; normal configured calls remain bounded.
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || options.signal?.aborted)
        return super.request<Result>(method, params, options);
      const controller = new AbortController();
      const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
      let remaining = timeoutMs, started = 0, finished = false, timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = (preserve: boolean) => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
        if (preserve) remaining = Math.max(0, remaining - Math.max(0, now() - started));
      };
      const arm = () => {
        stop(false);
        if (finished || signal.aborted || this.humanWaits > 0) return;
        started = now();
        timer = setTimeout(() => {
          timer = undefined;
          if (signal.aborted) return;
          timedOut = true;
          controller.abort("MCP active request timeout");
        }, remaining);
      };
      const deadline = { pause: () => stop(true), resume: arm };
      const abort = () => stop(false);
      signal.addEventListener("abort", abort, { once: true });
      this.deadlines.add(deadline);
      arm();
      try {
        return await super.request<Result>(method, params, {
          ...options,
          // Replaced, not removed: this adapter owns the equivalent pausable deadline.
          timeoutMs: 0,
          signal,
          ...(options.onProgress ? { onProgress: progress => {
            remaining = timeoutMs;
            arm();
            options.onProgress?.(progress);
          } } : {}),
        });
      } catch (error) {
        if (timedOut) throw new Timeout(timeoutMs);
        throw error;
      } finally {
        finished = true;
        stop(false);
        this.deadlines.delete(deadline);
        signal.removeEventListener("abort", abort);
        controller.abort("Request settled");
      }
    }
  };
}
