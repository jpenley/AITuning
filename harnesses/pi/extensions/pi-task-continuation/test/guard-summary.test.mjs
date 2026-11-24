import test from 'node:test';
import assert from 'node:assert/strict';
import { guardSummary } from '../src/summary.mjs';

const RULES = 'Continue unfinished, unblocked todo work within the existing user scope and permissions.';

// Break: the collapsed transcript line repeats the rules or the JSON task data.
test('guard messages collapse to one line naming the tasks to continue', () => {
  const content = `Task guard: unfinished work remains. Continue #5, #7, #9. These tasks have no unfinished dependencies.\n${RULES}\nTask data (up to 30 of 3 unfinished tasks): [{"id":5}]`;
  assert.equal(guardSummary(content), 'Task guard: continue #5, #7, #9');
  assert.equal(guardSummary([{ type: 'text', text: content }]), 'Task guard: continue #5, #7, #9');
});

test('long task lists are capped and other guard messages keep their first line', () => {
  const ids = Array.from({ length: 9 }, (_, i) => `#${i + 1}`).join(', ');
  assert.equal(guardSummary(`Task guard: unfinished work remains. Continue ${ids}. These tasks have no unfinished dependencies.`), 'Task guard: continue #1, #2, #3, #4, #5, #6 +3 more');
  assert.equal(guardSummary('Task guard: unfinished work remains. Review waiting conditions for #2 using task_blocker clear or set.'), 'Task guard: review waiting conditions');
  assert.equal(guardSummary('Task guard cannot read the task list: broken\nmore'), 'Task guard cannot read the task list: broken');
  assert.equal(guardSummary('\x1b[31mTask guard\x1b[0m stopped'), 'Task guard stopped');
  assert.equal(guardSummary(undefined), 'Task guard');
});
