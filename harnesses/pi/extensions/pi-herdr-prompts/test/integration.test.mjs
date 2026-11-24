import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import bridge from '../index.ts';

const integrationPath = process.env.PI_HERDR_INTEGRATION_PATH;
assert.ok(integrationPath, 'Set PI_HERDR_INTEGRATION_PATH to herdr-agent-state.ts.');

// Break: the event bridge works in isolation but herdr never receives blocked
// (or remains blocked after the questionnaire's answer/cancel/error cleanup).
test('installed herdr integration sends blocked and restores working then idle', { timeout: 10000 }, async t => {
  const name = `pi-herdr-test-${randomUUID()}`;
  const socketPath = process.platform === 'win32' ? name : join(tmpdir(), `${name}.sock`);
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : socketPath;
  const reports = [];
  const waiters = new Set();
  const server = net.createServer(socket => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', data => {
      buffer += data;
      if (!buffer.includes('\n')) return;
      const request = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
      if (request.method === 'pane.report_agent') {
        reports.push(request.params);
        for (const notify of waiters) notify();
      }
      socket.end('{}\n');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint, resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

  function waitForReports(count) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`Expected ${count} state reports, received ${JSON.stringify(reports)}`));
      }, 3000);
      function check() {
        if (reports.length < count) return;
        clearTimeout(timeout);
        waiters.delete(check);
        resolve();
      }
      waiters.add(check);
      check();
    });
  }

  const env = { HERDR_ENV: '1', HERDR_SOCKET_PATH: socketPath, HERDR_PANE_ID: 'test-pane' };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const events = new EventEmitter();
  const handlers = new Map();
  const pi = { events, on: (name, handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]) };
  const emit = async (name, event = {}, ctx) => { for (const handler of handlers.get(name) ?? []) await handler(event, ctx); };
  try {
    Object.assign(process.env, env);
    const { default: herdr } = await import(pathToFileURL(integrationPath));
    herdr(pi);
    bridge(pi);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  let idle = true;
  const ctx = { mode: 'tui', isIdle: () => idle };
  await emit('session_start', { reason: 'startup' }, ctx);
  await waitForReports(1);
  idle = false;
  await emit('agent_start', {}, ctx);
  await waitForReports(2);
  await emit('ui_prompt_start', { type: 'ui_prompt_start', reason: 'ui_prompt', kind: 'confirm' });
  await waitForReports(3);
  assert.equal(reports.at(-1).state, 'blocked');
  await emit('ui_prompt_end', { type: 'ui_prompt_end', reason: 'ui_prompt', kind: 'confirm' });
  await waitForReports(4);
  assert.equal(reports.at(-1).state, 'working');
  events.emit('rpiv:ask-user:blocked', { active: true, toolCallId: 'question' });
  await waitForReports(5);
  assert.equal(reports.at(-1).state, 'blocked');
  assert.equal(reports.at(-1).message, 'Waiting for user input');
  events.emit('rpiv:ask-user:blocked', { active: false, toolCallId: 'question' });
  await waitForReports(6);
  idle = true;
  await emit('agent_settled', {}, ctx);
  await waitForReports(7);
  assert.deepEqual(reports.map(report => report.state), ['idle', 'working', 'blocked', 'working', 'blocked', 'working', 'idle']);
  events.emit('task-guard:blocked', { active: true });
  await waitForReports(8);
  assert.equal(reports.at(-1).state, 'blocked');
  events.emit('rpiv:ask-user:blocked', { active: true, toolCallId: 'overlap' });
  await waitForReports(9);
  assert.equal(reports.at(-1).state, 'blocked');
  events.emit('rpiv:ask-user:blocked', { active: false, toolCallId: 'overlap' });
  await emit('agent_settled', {}, ctx);
  assert.equal(reports.at(-1).state, 'blocked');
  events.emit('task-guard:blocked', { active: false });
  await waitForReports(10);
  assert.equal(reports.at(-1).state, 'idle');
  await emit('session_shutdown', {}, ctx);
  assert.ok(reports.every(report => report.pane_id === 'test-pane' && report.source === 'herdr:pi'));
  assert.ok(reports.every((report, index) => index === 0 || report.seq > reports[index - 1].seq));
});
