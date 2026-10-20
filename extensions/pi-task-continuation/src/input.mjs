import { clean } from './state.mjs';

// These are interaction choices, not invented answers to the user's decision.
const ANSWER_NOW = 'Answer now';
const KEEP_BLOCKED = 'Keep blocked';
export async function collectTaskInput(pi, ctx, signal, callId, params) {
  const cancelled = () => signal?.aborted;
  const title = `Task ${params.taskIds.slice(0, 10).map(id => `#${id}`).join(', ')}: ${clean(params.reason)}\nNext action: ${clean(params.nextAction)}`;
  const native = async () => {
    if (cancelled()) return { status: 'cancelled' };
    const answer = await ctx.ui.input(title, 'Enter the information needed (no credentials)', { signal });
    return !cancelled() && typeof answer === 'string' && clean(answer, 8000)
      ? { status: 'answered', answer: clean(answer, 8000) } : { status: 'cancelled' };
  };
  // RPC uses native dialogs: RPIV's RPC walker does not support signal cancellation.
  if (ctx.mode !== 'tui' || !ctx.tools?.some(tool => tool.name === 'ask_user_question') || typeof ctx.executeTool !== 'function') return native();
  if (cancelled()) return { status: 'cancelled' };
  const question = `${title}\nWhat information can you provide? Use the custom-answer row to answer directly, or choose Answer now to open a text dialog.`;
  let nestedId;
  // RPIV ignores execute's signal. Its public answer channel closes the precise TUI.
  const cancel = () => { if (nestedId) pi.events.emit('rpiv:ask-user:answer', { toolCallId: nestedId, cancel: true }); };
  const off = pi.events.on('rpiv:ask-user:prompt', payload => {
    if (typeof payload?.toolCallId !== 'string' || !payload.toolCallId.startsWith(`${callId}/`) || !/^\d+$/u.test(payload.toolCallId.slice(callId.length + 1))) return;
    nestedId = payload.toolCallId;
    if (cancelled()) cancel();
  });
  signal?.addEventListener('abort', cancel, { once: true });
  let outcome;
  try {
    outcome = await ctx.executeTool('ask_user_question', { questions: [{ question, header: 'Task input', options: [
      { label: ANSWER_NOW, description: 'Open a text dialog to supply the requested information.' },
      { label: KEEP_BLOCKED, description: 'Leave this task blocked and continue any independent work.' },
    ] }] }, { signal });
  } finally {
    signal?.removeEventListener('abort', cancel);
    off();
  }
  if (cancelled()) return { status: 'cancelled' };
  // Tool-call denial must not be bypassed with another UI route.
  if (outcome?.isError || outcome?.result?.isError) return typeof outcome?.durationMs === 'number' ? native() : { status: 'unavailable' };
  const details = outcome?.result?.details;
  if (details?.error) return native();
  if (details?.cancelled === true) return { status: 'cancelled' };
  const answer = details?.answers?.length === 1 ? details.answers[0] : undefined;
  if (details?.cancelled !== false || details?.unanswered?.length || answer?.questionIndex !== 0 || answer.question !== question) return native();
  if (answer.kind === 'custom' && typeof answer.answer === 'string' && clean(answer.answer, 8000)) return { status: 'answered', answer: clean(answer.answer, 8000) };
  if (answer.kind === 'option' && answer.answer === KEEP_BLOCKED) return { status: 'cancelled' };
  return native();
}
