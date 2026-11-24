import { VERSION, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { registerTaskContinuation, NOTICE_TYPE } from './src/extension.mjs';
import { clean, MESSAGE_TYPE } from './src/state.mjs';
import { guardSummary } from './src/summary.mjs';

export default function taskContinuation(pi: ExtensionAPI) {
  if (!['1.3.0', '1.4.0'].includes(VERSION)) console.warn(`[pi-task-continuation] Pi ${VERSION} compatibility is unknown; tested with Pi 1.3.0 and 1.4.0. Attempting to load.`);
  pi.registerEntryRenderer<{ text: string }>(NOTICE_TYPE, entry => {
    const text = typeof entry.data?.text === 'string' ? entry.data.text.slice(0, 16000) : 'Task guard notice is unavailable.';
    return new Text(text.split('\n').map(line => clean(line, 2000)).join('\n'), 0, 0);
  });
  // Collapsed: one dim line. Expanded (ctrl+o): the full text the model received.
  pi.registerMessageRenderer(MESSAGE_TYPE, (message, options, theme) => {
    const raw = typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.filter((part: { type?: string }) => part?.type === 'text').map((part: { text: string }) => part.text).join('\n') : '';
    if (options.expanded) return new Text(raw.slice(0, 16000).split('\n').map(line => clean(line, 2000)).join('\n'), options.outputPad, 0);
    return new Text(theme.fg('dim', `↻ ${guardSummary(raw)}`), options.outputPad, 0);
  });
  registerTaskContinuation(pi, {
    maxNudges: process.env.PI_TASK_GUARD_MAX_NUDGES,
    maxNoProgress: process.env.PI_TASK_GUARD_MAX_NO_PROGRESS,
  });
}
