import { parseArgs, VERSION, type ExtensionAPI, type ExtensionFactory } from '@earendil-works/pi-coding-agent';
import registerCollector from 'pi-mcp-elicitation';
import { createMcpExtension, type McpExtensionOptions } from './src/mcp/index.ts';

export type McpMirrorOptions = McpExtensionOptions;
export type { McpCredentialStore } from './src/mcp/oauth.ts';
export { registerElicitationAdapter } from 'pi-mcp-elicitation/adapters';

/** Native-derived session MCP; stock Codemode and tool search remain host-owned. */
export function createMcpMirrorExtension(options: McpMirrorOptions = {}): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    // Use the host parser: a prompt after -- or an option value is not a switch.
    if (parseArgs(process.argv.slice(2)).noMcp) return;
    if (VERSION !== '1.3.0') {
      throw new Error(`pi-mcp-mirror is qualified for Pi 1.3.0, not ${VERSION}. Requalify the package before activation.`);
    }
    registerCollector(pi);
    return createMcpExtension(options)(pi);
  };
}

export default createMcpMirrorExtension();
