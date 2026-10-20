import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sdk as unbundled, root } from './helpers.mjs';

const bundled = await import(pathToFileURL(join(root, 'dist/bundle/index.js')));

for (const [name, sdk] of [['SDK', unbundled], ['bundled CLI SDK', bundled]]) {
  test(`${name}: predictive mode replaces auto inline without hiding other extension statuses`, () => {
    sdk.initTheme('dark', false);
    const statuses = new Map();
    const model = { id: 'test-model', provider: 'openai', contextWindow: 100000 };
    const manager = sdk.SessionManager.inMemory(process.cwd());
    const session = {
      sessionManager: manager, model, state: { model },
      modelRuntime: { isUsingSubscription: () => false },
      getContextUsage: () => ({ percent: 42, contextWindow: 100000 }),
    };
    const footer = new sdk.FooterComponent(session, {
      getGitBranch: () => 'test', getAvailableProviderCount: () => 1,
      getExtensionStatuses: () => statuses,
    });
    const render = width => footer.render(width).map(line => line.replace(/\x1b\[[0-9;]*m/g, ''));
    try {
      assert.equal(render(120).length, 2);
      assert.match(render(120)[1], /42\.0%\/100k \(auto\)/);
      statuses.set('predictive-compaction', 'predict');
      assert.equal(render(120).length, 2, 'predictive status must not allocate a third row');
      assert.match(render(120)[1], /42\.0%\/100k \(predict\)/);
      statuses.set('another-extension', 'other status');
      assert.equal(render(120).length, 3);
      assert.equal(render(120)[2], 'other status');
      assert.equal(statuses.get('predictive-compaction'), 'predict', 'rendering must not mutate provider state');
      for (const width of [30, 80, 120]) {
        const lines = render(width);
        assert.ok(lines.every(line => line.length <= width));
        assert.match(lines[1], /\(predict\)/);
      }
      footer.setAutoCompactEnabled(false);
      assert.doesNotMatch(render(120)[1], /\((?:auto|predict)\)/);
      statuses.delete('predictive-compaction');
      footer.setAutoCompactEnabled(true);
      assert.match(render(120)[1], /\(auto\)/);
      assert.equal(render(120)[2], 'other status');
      statuses.clear();
      assert.equal(render(120).length, 2);
    } finally { footer.dispose(); }
  });
}
