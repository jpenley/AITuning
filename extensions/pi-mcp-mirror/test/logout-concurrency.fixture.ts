import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInMemoryTransportPair } from "@earendil-works/pi-mcp/testing";
import { expect, test, vi } from "vitest";
import { McpServerConnection } from "__MIRROR_RUNTIME__";

const backoff = vi.hoisted(() => ({ active: false,
  entered: undefined as ((signal: AbortSignal) => void) | undefined,
  release: undefined as (() => void) | undefined,
}));
vi.mock("node:timers/promises", async importOriginal => {
  const original = await importOriginal<typeof import("node:timers/promises")>();
  return { ...original, setTimeout: (ms: number, value: unknown, options: { signal?: AbortSignal } = {}) => {
    if (!backoff.active) return original.setTimeout(ms, value, options);
    return new Promise((resolve, reject) => {
      const signal = options.signal;
      if (!signal) throw new Error("Retry must have a cancellation signal");
      const abort = () => { signal.removeEventListener("abort", abort); reject(new DOMException("Aborted", "AbortError")); };
      backoff.release = () => { signal.removeEventListener("abort", abort); resolve(value); };
      signal.addEventListener("abort", abort, { once: true });
      backoff.entered?.(signal);
      if (signal.aborted) abort();
    });
  } };
});

// The remote transport and persistence adapter are boundary doubles, not dispatch.
test("pending logout coalesces callers, blocks new connections and snapshots state only after deletion", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "mirror-signout-lane-"));
  const pair = createInMemoryTransportPair();
  const sends: Promise<void>[] = [];
  const events: string[] = [];
  let stored = true;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const locking = new Promise<void>(resolve => { entered = resolve; });
  const store = {
    load: () => undefined,
    save: vi.fn(),
    withRefreshLock: vi.fn(async <T>(fn: () => Promise<T>) => {
      entered();
      await gate;
      events.push("locked");
      const result = await fn();
      events.push("unlock");
      return result;
    }),
  };
  const credentials = {
    forServer: () => store,
    tokens: () => undefined,
    remove: vi.fn(() => { events.push("remove"); const wasStored = stored; stored = false; return wasStored; }),
  };
  pair.server.onMessage(message => {
    if (!("id" in message) || !("method" in message)) return;
    const result = message.method === "initialize"
      ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "offline", version: "1" } }
      : message.method === "tools/list" ? { tools: [] } : undefined;
    if (!result) throw new Error(`Unexpected memory request: ${message.method}`);
    sends.push(pair.server.send({ jsonrpc: "2.0", id: message.id, result }));
  });
  await pair.server.start();
  const createTransport = vi.fn(() => pair.client);
  const changed = vi.fn((connection: McpServerConnection) => {
    if (connection.state === "needs-auth") events.push(`needs-auth:${stored}`);
  });
  const connection = new McpServerConnection({
    entry: { name: "lane", config: { url: "https://offline.example.invalid/mcp" }, source: "offline-test" },
    cwd, createTransport, credentials, onTools: vi.fn(), onChange: changed,
  });
  let first: Promise<boolean> | undefined;
  try {
    await connection.getClient();
    first = connection.signOut();
    const second = connection.signOut();
    await locking;
    expect(stored).toBe(true);
    await expect(connection.getClient()).rejects.toThrow("signing out");
    expect(createTransport).toHaveBeenCalledOnce();
    expect(credentials.remove).not.toHaveBeenCalled();
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(store.withRefreshLock).toHaveBeenCalledOnce();
    expect(credentials.remove).toHaveBeenCalledOnce();
    expect(events).toEqual(["locked", "remove", "unlock", "needs-auth:false"]);
    expect(await connection.signOut()).toBe(false);
  } finally {
    release();
    if (first) await first;
    await connection.close();
    await pair.server.close();
    await Promise.all(sends);
    await rm(cwd, { recursive: true, force: true });
  }
});

// Break caught: a reconnect already sleeping in retry backoff creates another
// transport after logout starts, because only getClient's entry was guarded.
test("logout aborts an already-open retry lane before another transport attempt", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "mirror-signout-retry-"));
  let entered!: (signal: AbortSignal) => void;
  const sleeping = new Promise<AbortSignal>(resolve => { entered = resolve; });
  backoff.active = true;
  backoff.entered = entered;
  let attempts = 0;
  const createTransport = vi.fn(() => {
    if (++attempts === 1) throw new TypeError("synthetic transient network failure");
    throw new Error("Unexpected retry transport after logout");
  });
  const store = { load: () => undefined, save: vi.fn(), withRefreshLock: async <T>(fn: () => Promise<T>) => fn() };
  const connection = new McpServerConnection({
    entry: { name: "retry", config: { url: "https://offline.example.invalid/mcp" }, source: "offline-test" },
    cwd, createTransport, credentials: { forServer: () => store, tokens: () => undefined, remove: () => false }, onTools: vi.fn(),
  });
  const opening = connection.getClient().then(() => { throw new Error("Opening cannot succeed"); }, error => error);
  let signingOut: Promise<boolean> | undefined;
  try {
    await sleeping;
    signingOut = connection.signOut();
    backoff.release?.();
    await signingOut;
    expect(await opening).toBeInstanceOf(Error);
    expect(createTransport).toHaveBeenCalledOnce();
  } finally {
    backoff.release?.();
    backoff.active = false;
    backoff.entered = undefined;
    await opening;
    if (signingOut) await signingOut;
    await connection.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

// Break caught: reconnect detached its client before awaiting close, so logout
// cannot see that teardown and an older reconnect opens again after logout.
test("logout invalidates a reconnect waiting on detached transport teardown", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "mirror-detached-reconnect-"));
  const pair = createInMemoryTransportPair();
  const sends: Promise<void>[] = [];
  pair.server.onMessage(message => {
    if (!("id" in message) || !("method" in message)) return;
    const result = message.method === "initialize"
      ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "offline", version: "1" } }
      : message.method === "tools/list" ? { tools: [] } : undefined;
    if (!result) throw new Error(`Unexpected memory request: ${message.method}`);
    sends.push(pair.server.send({ jsonrpc: "2.0", id: message.id, result }));
  });
  await pair.server.start();
  const closing = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const close = pair.client.close.bind(pair.client);
  pair.client.close = async () => { closing.resolve(); await release.promise; await close(); };
  const createTransport = vi.fn(() => pair.client);
  const store = { load: () => undefined, save: vi.fn(), withRefreshLock: async <T>(fn: () => Promise<T>) => fn() };
  const connection = new McpServerConnection({
    entry: { name: "detached", config: { url: "https://offline.example.invalid/mcp" }, source: "offline-test" },
    cwd, createTransport, credentials: { forServer: () => store, tokens: () => undefined, remove: () => false }, onTools: vi.fn(),
  });
  let reconnecting: Promise<{ error?: unknown }> | undefined;
  try {
    await connection.getClient();
    reconnecting = connection.reconnect().then(() => ({}), error => ({ error }));
    await closing.promise;
    expect(await connection.signOut()).toBe(false);
    expect(connection.state).toBe("needs-auth");
    release.resolve();
    const result = await reconnecting;
    expect(createTransport).toHaveBeenCalledOnce();
    expect(result.error).toBeInstanceOf(Error);
    expect(connection.state).toBe("needs-auth");
  } finally {
    release.resolve();
    if (reconnecting) await reconnecting;
    await connection.close();
    await pair.server.close();
    await Promise.all(sends);
    await rm(cwd, { recursive: true, force: true });
  }
});
