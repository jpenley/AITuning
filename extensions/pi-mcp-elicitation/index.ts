import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerElicitation } from './src/extension.mjs';
export { registerElicitationAdapter } from './src/adapters.mjs';

export default function mcpElicitation(pi: ExtensionAPI) {
  registerElicitation(pi);
}
