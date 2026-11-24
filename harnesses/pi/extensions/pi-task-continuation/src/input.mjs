import { clean } from './state.mjs';

// These are interaction choices, not invented answers to the user's decision.
const LONG_ANSWER = 'Write a longer answer';
const KEEP_BLOCKED = 'Keep blocked';
export async function collectTaskInput(pi, ctx, signal, callId, params) {
  const cancelled = () => signal?.aborted;
  const tasks = params.taskIds.slice(0, 10).map(id => `#${id}`).join(', ');
  // The model-written question leads; the reason only explains why it is being asked.
  const question = `${clean(params.question, 300)}\nNeeded for task ${tasks}: ${clean(params.reason)}`;
  const choices = Array.isArray(params.choices) ? params.choices.map(choice => clean(choice, 60)) : [];
  const native = async () => {
    if (cancelled()) return { status: 'cancelled' };
    const answer = await ctx.ui.input(question, 'Type your answer (no credentials)', { signal });
    return !cancelled() && typeof answer === 'string' && clean(answer, 8000)
      ? { status: 'answered', answer: clean(answer, 8000) } : { status: 'cancelled' };
  };
  // RPC uses native dialogs: RPIV's RPC walker does not support signal cancellation.
  if (ctx.mode !== 'tui' || !ctx.tools?.some(tool => tool.name === 'ask_user_question') || typeof ctx.executeTool !== 'function') return native();
  if (cancelled()) return { status: 'cancelled' };
  const options = [
    ...(choices.length ? choices.map(label => ({ label, description: 'Answer with this choice.' }))
      : [{ label: LONG_ANSWER, description: 'Open a text box for a longer answer. For a short answer, type it in the row below.' }]),
    { label: KEEP_BLOCKED, description: 'Do not answer now. The task stays blocked and independent work continues.' },
  ];
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
    outcome = await ctx.executeTool('ask_user_question', { questions: [{ question, header: `Task ${tasks}`.slice(0, 16), options }] }, { signal });
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
  if (answer.kind === 'option' && choices.includes(answer.answer)) return { status: 'answered', answer: answer.answer };
  return native();
}
