import { expect, test } from 'claude-code/testing';

test('registers the execution tool with its schema available upfront', async ($, on) => {
  let spec;
  on('tool.register', (_, e) => { spec=e; return {value:{tool:'mcp__code-mode__execute'}}; });
  on('session.start', (_,e) => ({cwd:e.cwd}));
  await $.session.start({surface:'terminal',isInteractive:true,cwd:'/work'});
  expect(spec.name).toBe('execute');
  expect(spec.isDeferred).toBe(false);
  expect(spec.inputSchema.additionalProperties).toBe(false);
});

test('rejects empty code before starting a helper or underlying tool', async ($, on) => {
  on('tool.call', () => { throw new Error('must not dispatch'); });
  const answer = await $.tool.call({tool:'mcp__code-mode__execute',code:''});
  expect(JSON.parse(answer.result).ok).toBe(false);
});
