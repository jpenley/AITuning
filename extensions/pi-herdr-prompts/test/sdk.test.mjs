import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

assert.ok(process.env.PI_HERDR_SDK_ROOT, 'Set PI_HERDR_SDK_ROOT to the installed Pi package directory.');
const sdk = await import(pathToFileURL(join(process.env.PI_HERDR_SDK_ROOT, 'dist/index.js')));
globalThis.fetch = () => { throw new Error('Human-wait SDK tests forbid network requests.'); };

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'pi-herdr-sdk-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const events = sdk.createEventBus();
  const reports = [];
  const waiters = new Set();
  events.on('herdr:blocked', data => {
    reports.push(data);
    for (const notify of waiters) notify();
  });
  const loader = new sdk.DefaultResourceLoader({ cwd: directory, agentDir: directory, eventBus: events,
    settingsManager: sdk.SettingsManager.inMemory({ packages: [] }), noExtensions: true,
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL('../index.ts', import.meta.url))] });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  const runtime = await sdk.ModelRuntime.create({ authPath: join(directory, 'auth.json'), modelsPath: null,
    modelsStorePath: join(directory, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  const runner = new sdk.ExtensionRunner(loaded.extensions, loaded.runtime, directory,
    sdk.SessionManager.inMemory(directory), new sdk.ModelRegistry(runtime));
  const requests = [];
  const dialog = kind => (...args) => new Promise((resolve, reject) => requests.push({ kind, args, resolve, reject }));
  const ui = Object.fromEntries(['select', 'confirm', 'input', 'editor', 'custom'].map(kind => [kind, dialog(kind)]));
  runner.setUIContext(ui, 'tui');
  t.after(async () => {
    for (const request of requests) request.resolve(undefined);
    await runner.emit({ type: 'session_shutdown', reason: 'quit' });
  });
  function waitForReports(count) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`Expected ${count} herdr events, received ${JSON.stringify(reports)}`));
      }, 2000);
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
  return { events, reports, requests, runner, ui: runner.getUIContext(), waitForReports };
}

// Break: manual event fixtures pass but real Pi emits a different dialog contract.
for (const [kind, args, result] of [
  ['select', ['Private choices', ['first', 'second'], { timeout: 1000 }], 'second'],
  ['confirm', ['Private approval', 'Private operation details', { timeout: 1000 }], true],
  ['input', ['Private field', 'Private placeholder', { timeout: 1000 }], 'Private value'],
  ['editor', ['Private edit', 'Private prefill'], 'Private edited text'],
]) {
  test(`real Pi ${kind} dialog blocks and restores without exposing data`, { timeout: 10000 }, async t => {
    const h = await fixture(t);
    const pending = h.ui[kind](...args);
    await h.waitForReports(1);
    assert.deepEqual(h.reports, [{ active: true, label: 'Waiting for user input' }]);
    assert.deepEqual(h.requests[0].args, args);
    h.requests[0].resolve(result);
    assert.equal(await pending, result);
    await h.waitForReports(2);
    assert.deepEqual(h.reports, [
      { active: true, label: 'Waiting for user input' },
      { active: false, label: 'Waiting for user input' },
    ]);
  });
}

// Break: cancelling a selector leaves the native contribution active.
test('real Pi cancellation clears the wait', { timeout: 10000 }, async t => {
  const h = await fixture(t);
  const pending = h.ui.select('Choose', ['a', 'b']);
  await h.waitForReports(1);
  h.requests[0].resolve(undefined);
  assert.equal(await pending, undefined);
  await h.waitForReports(2);
  assert.deepEqual(h.reports.map(report => report.active), [true, false]);
});

// Break: rejected or synchronously throwing dialogs leave herdr stuck as blocked.
test('real Pi asynchronous and synchronous UI errors clear their waits', { timeout: 10000 }, async t => {
  const h = await fixture(t);
  const pending = h.ui.confirm('Approve?', 'Operation');
  const rejected = assert.rejects(pending, /dialog failed/);
  await h.waitForReports(1);
  h.requests[0].reject(new Error('dialog failed'));
  await rejected;
  await h.waitForReports(2);
  h.runner.setUIContext({ input() { throw new Error('synchronous dialog failure'); } }, 'tui');
  assert.throws(() => h.runner.getUIContext().input('Field'), /synchronous dialog failure/);
  await h.waitForReports(4);
  assert.deepEqual(h.reports.map(report => report.active), [true, false, true, false]);
});

// Break: the first of overlapping dialogs clears either the native or RPIV wait.
test('real Pi overlapping dialogs remain independently balanced with a questionnaire', { timeout: 10000 }, async t => {
  const h = await fixture(t);
  h.events.emit('rpiv:ask-user:blocked', { active: true, toolCallId: 'question' });
  const first = h.ui.confirm('Approve?', 'Operation');
  const second = h.ui.input('Field');
  await h.waitForReports(2);
  h.requests[0].resolve(true);
  await first;
  assert.deepEqual(h.reports.map(report => report.active), [true, true]);
  h.events.emit('rpiv:ask-user:blocked', { active: false, toolCallId: 'question' });
  h.requests[1].resolve('answer');
  await second;
  await h.waitForReports(4);
  assert.deepEqual(h.reports.map(report => report.active), [true, true, false, false]);
});

// Break: a generic custom viewer becomes a false human-wait indicator.
test('real Pi custom viewer events are ignored', { timeout: 10000 }, async t => {
  const h = await fixture(t);
  const pending = h.ui.custom(() => ({ render: () => ['Viewer'] }));
  h.requests[0].resolve('closed');
  await pending;
  assert.deepEqual(h.reports, []);
});
