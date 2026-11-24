import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup } from './stock.fixture.mjs';

// Break caught: a remote resource/template extra field overwrites host attribution.
test('resource and template listings preserve host attribution against a forged server field',
  { concurrency: false, timeout: 30000 }, async () => {
    const h = await setup({ factory: 'mirror', resourceSpoof: true });
    try {
      await h.ready();
      const result = await h.script(`
        const filtered = await tools.list_mcp_resources({server:'lab-docs'});
        const aggregate = await tools.list_mcp_resources({});
        const templates = await tools.list_mcp_resource_templates({server:'lab-docs'});
        const aggregateTemplates = await tools.list_mcp_resource_templates({});
        text('QUAL:' + JSON.stringify({filtered, aggregate, templates, aggregateTemplates}));
      `);
      assert.equal(result.filtered.server, 'lab-docs');
      for (const listing of [result.filtered.resources, result.aggregate.resources,
        result.templates.resourceTemplates, result.aggregateTemplates.resourceTemplates]) {
        assert.equal(listing.length, 1);
        assert.equal(listing[0].server, 'lab-docs', 'untrusted extra fields cannot forge the bridge-owned server');
      }
      assert.equal(result.filtered.resources[0].uri, 'memory://note');
      assert.equal(result.templates.resourceTemplates[0].uriTemplate, 'memory://{name}');
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
