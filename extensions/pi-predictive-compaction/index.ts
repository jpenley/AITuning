import * as sdk from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerPredictiveCompaction } from './src/extension.mjs';

export default function predictiveCompaction(pi: ExtensionAPI) {
  registerPredictiveCompaction(pi, sdk);
}
