/** Compile-time consumer regression: imports only documented package entry points. */
import type { McpExtensionOptions } from '@earendil-works/pi-coding-agent';
import type { McpOAuthState } from '@earendil-works/pi-mcp/oauth';
import { createMcpMirrorExtension, type McpMirrorOptions } from '../index.ts';

type Assert<T extends true> = T;
export type NativeOptionsRemainAssignable = Assert<McpExtensionOptions extends McpMirrorOptions ? true : false>;

const states = new Map<string, McpOAuthState>();
const key = (name: string, url: string): string => `${name}|${new URL(url).href}`;
export const isolatedConsumer = createMcpMirrorExtension({
  credentials: {
    forServer: (name, url) => ({
      load: () => states.get(key(name, url)),
      save: state => { states.set(key(name, url), state); },
      withRefreshLock: async fn => fn(),
    }),
    tokens: (name, url) => states.get(key(name, url))?.tokens,
    remove: (name, url) => states.delete(key(name, url)),
  },
});
