import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { registerTaskContinuation, NOTICE_TYPE } from './src/extension.mjs';
import { clean } from './src/state.mjs';

export default function taskContinuation(pi: ExtensionAPI) {
  pi.registerEntryRenderer<{ text: string }>(NOTICE_TYPE, entry => {
    const text = typeof entry.data?.text === 'string' ? entry.data.text.slice(0, 16000) : 'Task guard notice is unavailable.';
    return new Text(text.split('\n').map(line => clean(line, 2000)).join('\n'), 0, 0);
  });
  registerTaskContinuation(pi, {
    maxNudges: process.env.PI_TASK_GUARD_MAX_NUDGES,
    maxNoProgress: process.env.PI_TASK_GUARD_MAX_NO_PROGRESS,
  });
}
