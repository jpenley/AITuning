import { VERSION, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { CURSOR_MARKER, Editor, SelectList, getKeybindings, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { registerElicitation } from './src/extension.mjs';
export { registerElicitationAdapter } from './src/adapters.mjs';

export default function mcpElicitation(pi: ExtensionAPI) {
  if (!['1.3.0', '1.4.0'].includes(VERSION)) console.warn(`[pi-mcp-elicitation] Pi ${VERSION} compatibility is unknown; tested with Pi 1.3.0 and 1.4.0. Attempting to load.`);
  registerElicitation(pi, { uiKit: { CURSOR_MARKER, Editor, SelectList, getKeybindings, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } });
}
