// Optional in-process presentation handshake. Without a mounted consumer the
// guard keeps Pi's normal footer status; the guard's behavior is unchanged.
export function guardStatus(pi) {
  let latest, unsubscribe = [];
  const publish = () => {
    if (!latest) return;
    const { ctx, text } = latest;
    const event = { sessionId: ctx.sessionManager.getSessionId(), text, accepted: false };
    pi.events.emit('task-guard:status-display:v1', event);
    ctx.ui.setStatus('task-guard', event.accepted ? undefined : text);
  };
  pi.on('session_start', () => {
    unsubscribe.forEach(stop => stop());
    latest = undefined;
    unsubscribe = [
      pi.events.on('task-guard:status-display-request:v1', request => {
        if (latest?.ctx.sessionManager.getSessionId() === request?.sessionId) publish();
      }),
      pi.events.on('task-guard:status-display-release:v1', request => {
        if (latest?.ctx.sessionManager.getSessionId() === request?.sessionId) latest.ctx.ui.setStatus('task-guard', latest.text);
      }),
    ];
  });
  pi.on('session_shutdown', () => {
    unsubscribe.forEach(stop => stop()); unsubscribe = []; latest = undefined;
  });
  return (ctx, text) => {
    if (ctx.mode !== 'tui') { ctx.ui.setStatus('task-guard', text); return; }
    latest = { ctx, text };
    publish();
  };
}
