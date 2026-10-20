import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

assert.ok(process.env.PI_PREDICTIVE_SDK_ROOT, 'Set PI_PREDICTIVE_SDK_ROOT to the qualified patched runtime');
export const root = process.env.PI_PREDICTIVE_SDK_ROOT;
export const sdk = await import(pathToFileURL(join(root, 'dist/index.js')));
export const zeroUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
export const assistant = (text, extra = {}) => ({ role: 'assistant', api: 'openai-responses', provider: 'openai', model: 'gpt-6.1-sol', content: [{ type: 'text', text }], stopReason: 'stop', timestamp: 2, usage: zeroUsage(), ...extra });

export function history(manager, count = 18) {
  manager.appendMessage({ role: 'user', content: 'Do not publish. Approval applies once only.\r\nKeep emoji: 🛠️ and accents: café.', timestamp: 1 });
  manager.appendMessage(assistant('Ruling: no global approval waiver.\r\nA next line.'));
  for (let i = 0; i < count; i++) {
    manager.appendMessage({ role: 'user', content: 'Earlier request ' + i, timestamp: 1 });
    manager.appendMessage(assistant(`Inspected and edited module ${i}: ` + 'const usefulCode = 123;\n'.repeat(2000)));
  }
  const currentId = manager.appendMessage({ role: 'user', content: 'CURRENT STEP: edit the API, run the check, preserve this latest request exactly.\r\n', timestamp: 1 });
  manager.appendMessage(assistant('current raw context'));
  return currentId;
}

export function context(manager, overrides = {}) {
  const model = { id: 'gpt-6.1-sol', provider: 'openai', api: 'openai-responses', contextWindow: 272000, maxTokens: 128000, cost: {} };
  return { model, sessionManager: manager, modelRegistry: {}, getSystemPrompt: () => 'Pi owns tools and permissions.', getContextUsage: () => ({ tokens: 250000, contextWindow: 272000 }), getCompactionSettings: () => ({ enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 }), setPredictiveCompactionEnabled: enabled => { manager.predictiveEnabled = enabled; }, createUsageRecorder: () => (...args) => manager.appendUsage(...args), ...overrides };
}
