import { clean } from './state.mjs';

// The guard's model-facing message carries rules and JSON task data. The transcript
// only needs what it is doing; the full text stays one expand (ctrl+o) away.
export function guardSummary(content) {
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(part => part?.type === 'text').map(part => part.text).join('\n') : '';
  const ansi = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]/g;
  const first = clean((text.split('\n')[0] ?? '').replace(ansi, ''), 400);
  const ids = /Continue ((?:#\d+(?:, )?)+)\./.exec(first)?.[1];
  if (ids) {
    const list = ids.split(', ');
    return `Task guard: continue ${list.slice(0, 6).join(', ')}${list.length > 6 ? ` +${list.length - 6} more` : ''}`;
  }
  if (/^Task guard: unfinished work remains\. Review/.test(first)) return 'Task guard: review waiting conditions';
  return first.replace(/^Task guard: unfinished work remains\.\s*/, 'Task guard: ') || 'Task guard';
}
