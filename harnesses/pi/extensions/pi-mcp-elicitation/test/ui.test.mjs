import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRequest } from '../src/form.mjs';
import { createFormView } from '../src/ui.mjs';

assert.ok(process.env.SDK_ROOT, 'SDK_ROOT must name the installed Pi package root (no skips).');
const require = createRequire(pathToFileURL(join(process.env.SDK_ROOT, 'package.json')));
const kit = await import(pathToFileURL(require.resolve('@earendil-works/pi-tui')));
globalThis.fetch = () => { throw new Error('Network forbidden in form UI tests'); };
const enter = '\r', up = '\x1b[A', down = '\x1b[B', tab = '\t';

function fixture(properties, options = {}) {
  const form = parseRequest({ server: options.server ?? 'fixture-files', source: 'offline-test-config', request: {
    message: options.message ?? 'Supply a response for this offline UI fixture.',
    requestedSchema: { type: 'object', properties, required: options.required ?? Object.keys(properties) },
  } });
  const replies = [], terminal = { rows: options.rows ?? 40, columns: 100 };
  const tui = { terminal, requestRender() {} };
  const theme = { fg: (_token, text) => text };
  const component = createFormView(form, { tui, theme, keybindings: { matches: () => false }, kit }, response => replies.push(response));
  component.focused = true;
  return { component, form, tui, theme, replies, screen: (width = 100) => component.render(width).join('\n') };
}

// Break: a general form hides the server's field instructions, constraints or suggested default.
test('readable request paragraphs and field instructions stay together in the form', () => {
  const h = fixture({ copies: { type: 'integer', title: 'Copies', description: 'Choose how many copies to print.', minimum: 1, maximum: 9, default: 7 } }, {
    message: 'Prepare printing.\nDirectory: D:\\print-jobs\nDuration: this connection only.',
  });
  const screen = h.screen();
  assert.match(screen, /Directory: D:\\print-jobs/);
  assert.match(screen, /Duration: this connection only/);
  assert.doesNotMatch(screen, /\\u000a/u);
  assert.match(screen, /Choose how many copies to print\./);
  assert.match(screen, /min(?:imum)?[: ]+1/i);
  assert.match(screen, /max(?:imum)?[: ]+9/i);
  assert.match(screen, /(?:suggested|default).*7/i);
  h.component.cancel();
  assert.deepEqual(h.replies, [{ action: 'cancel' }]);
});

// Break: a default or collected Yes is mistaken for final consent.
test('Yes and No are readable values, never consent on their own', () => {
  const h = fixture({ approve: { type: 'boolean', title: 'Approval', default: true } });
  h.component.handleInput(enter);
  assert.match(h.screen(), /Yes/); assert.match(h.screen(), /No/);
  assert.doesNotMatch(h.screen(), /C1|C2/u);
  assert.deepEqual(h.replies, []);
  h.component.handleInput(up); h.component.handleInput(enter); // Explicitly choose Yes, not the initial No.
  assert.deepEqual(h.replies, []);
  h.component.handleInput(tab); h.component.handleInput(up); h.component.handleInput(enter);
  assert.deepEqual(h.replies, [{ action: 'accept', content: { approve: true } }]);
});

// Break: optional defaults are sent without the user supplying those fields.
test('untouched optional defaults are omitted from the submitted response', () => {
  const h = fixture({ note: { type: 'string', default: 'suggested' }, count: { type: 'integer', default: 5 }, approve: { type: 'boolean', default: true } }, { required: [] });
  h.component.handleInput(tab); h.component.handleInput(up); h.component.handleInput(enter);
  assert.deepEqual(h.replies, [{ action: 'accept', content: {} }]);
});

// Break: chat submission trims whitespace, drops newlines, or Tab sends an older value.
test('text editing preserves exact whitespace and commits pending edits before Send', () => {
  const h = fixture({ note: { type: 'string' } });
  h.component.handleInput(enter);
  h.component.handleInput('\x1b[200~  hello\n world  \x1b[201~');
  h.component.handleInput(tab);
  assert.deepEqual(h.replies, []);
  h.component.handleInput(up); h.component.handleInput(enter);
  assert.deepEqual(h.replies, [{ action: 'accept', content: { note: '  hello\n world  ' } }]);

  const edited = fixture({ path: { type: 'string' } });
  for (const key of [enter, 'old', enter, enter, '\x15', 'new', tab, up, enter]) edited.component.handleInput(key);
  assert.deepEqual(edited.replies, [{ action: 'accept', content: { path: 'new' } }]);
});

// Break: a choice label or prototype key changes the underlying value, or control text executes.
test('unsafe choice text is encoded while original enum values and special keys round-trip', () => {
  const h = fixture(JSON.parse('{"__proto__":{"type":"string","oneOf":[{"const":"a\\u001b[31m\\u202eb","title":"Same"},{"const":"other","title":"Same"}]}}'));
  h.component.handleInput(enter);
  assert.doesNotMatch(h.screen(), /[\u001b\u202e]/u);
  h.component.handleInput(enter);
  assert.doesNotMatch(h.screen(), /[\u001b\u202e]/u);
  h.component.handleInput(tab); h.component.handleInput(up); h.component.handleInput(enter);
  assert.equal(Object.hasOwn(h.replies[0].content, '__proto__'), true);
  assert.equal(h.replies[0].content.__proto__, 'a\u001b[31m\u202eb');
});

// Break: duplicate display labels are treated as values, or a deselection is lost.
test('multiselect toggles real values and stays editable until explicit Send', () => {
  const h = fixture({ tags: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: ['a', 'b'], enumNames: ['Same', 'Same'] } } });
  for (const key of [enter, down, enter, up, enter, down, enter, down, enter]) h.component.handleInput(key);
  assert.deepEqual(h.replies, []);
  h.component.handleInput(tab); h.component.handleInput(up); h.component.handleInput(enter);
  assert.deepEqual(h.replies, [{ action: 'accept', content: { tags: ['a'] } }]);
});

// Break: final Send accepts missing required fields or out-of-range values.
test('invalid input stays in the same form and can be corrected without sending it', () => {
  const h = fixture({ count: { type: 'integer', minimum: 1, maximum: 9 } });
  for (const key of [tab, up, enter]) h.component.handleInput(key);
  assert.deepEqual(h.replies, []);
  assert.match(h.screen(), /Nothing sent/);
  for (const key of [enter, '0', enter]) h.component.handleInput(key);
  assert.deepEqual(h.replies, []);
  assert.match(h.screen(), /format or limits/);
  for (const key of ['\x15', '2', enter, tab, enter]) h.component.handleInput(key);
  assert.deepEqual(h.replies, [{ action: 'accept', content: { count: 2 } }]);
});

// Break: dismissing/declining returns collected answers or lets a later key submit them.
test('Decline and Cancel discard responses and ignore late input', () => {
  for (const action of ['decline', 'cancel']) {
    const h = fixture({ secret: { type: 'string' } });
    h.component.handleInput(enter); h.component.handleInput('synthetic-private-payload');
    if (action === 'decline') { h.component.handleInput(enter); h.component.handleInput(tab); h.component.handleInput(enter); }
    else h.component.handleInput('\x1b');
    h.component.handleInput(tab); h.component.handleInput(up); h.component.handleInput(enter);
    assert.deepEqual(h.replies, [{ action }]);
    assert.ok(!h.screen().includes('synthetic-private-payload'));
  }
});

// Break: narrow/short layouts clip the decision controls, lose request text, or change a choice on resize.
test('responsive form keeps controls reachable, scrolls full details and preserves choices on resize', () => {
  for (const rows of [12, 24, 40]) {
    const h = fixture({ approve: { type: 'boolean', title: '承認 👩🏽‍💻', description: 'Choose whether to approve this request.' }, note: { type: 'string' } }, {
      required: ['approve'], rows, message: 'Directory: D:\\工程\\printing\n' + 'Long requester-supplied explanation. '.repeat(45) + '\nDuration: this connection only. LifetimeMarker',
    });
    for (const width of [24, 40, 80, 120, 40]) {
      const lines = h.component.render(width);
      assert.ok(lines.every(line => kit.visibleWidth(line) <= width), `A line exceeds ${width} terminal columns.`);
      assert.ok(lines.length <= rows - 2, `${lines.length} rows exceed the ${rows - 2}-row form budget.`);
      assert.ok(lines.join('\n').includes('fixture-files'), 'The requesting server must remain identifiable.');
      for (const action of ['Send response', 'Decline request', 'Cancel']) assert.ok(lines.join('\n').includes(action), `${action} was clipped.`);
    }
    let prior = '', rendered = '';
    for (let page = 0; page < 200; page++) {
      const screen = h.screen(40); rendered += screen;
      if (screen === prior) break;
      prior = screen; h.component.handleInput('\x1b[6~');
    }
    assert.match(rendered, /LifetimeMarker/, 'Request text at the end must remain readable.');
    h.component.handleInput(enter); h.component.handleInput(up); // Select Yes without committing it.
    h.component.render(80); h.component.render(24);
    h.component.handleInput(enter); h.component.handleInput(tab); h.component.handleInput(up); h.component.handleInput(enter);
    assert.deepEqual(h.replies, [{ action: 'accept', content: { approve: true } }]);
  }
});

// Break: hover steals keyboard focus, turning a field-completion Enter into final consent.
test('hover over Send never turns field editing into consent', () => {
  const h = fixture({ count: { type: 'integer', minimum: 1 } });
  for (const key of [tab, up, enter, enter, '2']) h.component.handleInput(key);
  const lines = h.component.render(80);
  const y = lines.findIndex(line => line.replace(/[│→]/gu, '').trim() === 'Send response');
  assert.ok(y >= 0);
  h.component.handleMouse({ type: 'move', button: 'none', x: 4, y, screenX: 4, screenY: y, width: 80, height: lines.length, shift: false, alt: false, ctrl: false });
  h.component.handleInput(enter);
  assert.deepEqual(h.replies, [], 'Finishing the field is not a final Send action.');
  h.component.handleInput(tab); h.component.handleInput(enter);
  assert.deepEqual(h.replies, [{ action: 'accept', content: { count: 2 } }]);
});

// Break: mouse press commits/reflows the editor, or invalid data traps Decline/Cancel.
test('mouse decisions stay put and can discard invalid pending edits', () => {
  for (const [label, value, expected] of [
    ['Decline request', '0', { action: 'decline' }],
    ['Cancel', '0', { action: 'cancel' }],
    ['Send response', '2', { action: 'accept', content: { count: 2 } }],
  ]) {
    const h = fixture({ count: { type: 'integer', minimum: 1 } });
    h.component.handleInput(enter); h.component.handleInput(value);
    const lines = h.component.render(80);
    const actionRow = screen => screen.findIndex(line => line.replace(/[│→]/gu, '').trim() === label);
    const y = actionRow(lines); assert.ok(y >= 0);
    const event = { button: 'left', x: 4, y, screenX: 4, screenY: y, width: 80, height: lines.length, shift: false, alt: false, ctrl: false };
    h.component.handleMouse({ ...event, type: 'press' });
    assert.deepEqual(h.replies, [], 'Pressing is not yet a completed click.');
    assert.equal(actionRow(h.component.render(80)), y, 'A decision must not move under the pointer.');
    h.component.handleMouse({ ...event, type: 'click' });
    assert.deepEqual(h.replies, [expected]);
  }
});

// Break: an early paging key turns an uninitialised viewport offset into NaN and hides the request.
test('paging before the first render cannot corrupt the request viewport', () => {
  const h = fixture({ approve: { type: 'boolean' } }, { message: 'Directory: D:\\print-jobs\nDuration: connection only.' });
  h.component.handleInput('\x1b[6~');
  const screen = h.screen();
  assert.doesNotMatch(screen, /NaN/);
  assert.match(screen, /Directory: D:\\print-jobs/);
  h.component.cancel();
});

// Break: validating on Tab traps the user in an invalid field instead of allowing refusal.
test('keyboard Decline remains available while a pending field value is invalid', () => {
  const h = fixture({ count: { type: 'integer', minimum: 1 } });
  for (const key of [enter, '0', tab, enter]) h.component.handleInput(key);
  assert.deepEqual(h.replies, [{ action: 'decline' }]);
});

// Break: a wrapped editor loses IME cursor placement or paints beyond the available columns.
test('embedded editor forwards focus and keeps the hardware cursor in its visible viewport', () => {
  const h = fixture({ note: { type: 'string' } }, { rows: 24 });
  h.component.handleInput(enter); h.component.handleInput('漢字🙂');
  const lines = h.component.render(40);
  assert.ok(lines.some(line => line.includes(kit.CURSOR_MARKER)));
  assert.ok(lines.every(line => kit.visibleWidth(line) <= 40));
  h.component.focused = false;
  assert.ok(!h.component.render(40).some(line => line.includes(kit.CURSOR_MARKER)));
  h.component.focused = true;
  assert.ok(h.component.render(40).some(line => line.includes(kit.CURSOR_MARKER)));
  h.component.cancel();
});

// Break: opening an optional constrained field forces an invented answer before other fields are reachable.
test('an invalid optional edit can be abandoned by keyboard or mouse without inventing a value', () => {
  for (const schema of [{ type: 'integer' }, { type: 'string', format: 'email' }, { type: 'string', minLength: 3 }]) {
    for (const activation of ['keyboard', 'mouse']) {
      const h = fixture({ optional: schema, note: { type: 'string' } }, { required: ['note'] });
      h.component.handleInput(enter); h.component.handleInput(enter);
      if (activation === 'keyboard') h.component.handleInput('\x1bOQ');
      else {
        const lines = h.component.render(80);
        const y = lines.findIndex(line => line.replace(/[│→]/gu, '').trim() === 'F2: Discard edit, back to fields');
        assert.ok(y >= 0, 'The same-window return control must be visible.');
        const event = { button: 'left', x: 4, y, screenX: 4, screenY: y, width: 80, height: lines.length, shift: false, alt: false, ctrl: false };
        h.component.handleMouse({ ...event, type: 'press' });
        assert.deepEqual(h.replies, []);
        h.component.handleMouse({ ...event, type: 'click' });
      }
      assert.deepEqual(h.replies, [], 'Discarding a draft never submits.');
      for (const key of [down, enter, 'kept', enter, tab, up, enter]) h.component.handleInput(key);
      assert.deepEqual(h.replies, [{ action: 'accept', content: { note: 'kept' } }]);
    }
  }
});

// Break: discarding a replacement loses the previous valid value, or omission still requires a fake value.
test('discarding a replacement preserves the old value and still permits explicit omission', () => {
  for (const omit of [false, true]) {
    const h = fixture({ count: { type: 'integer', minimum: 1 } }, { required: [] });
    for (const key of [enter, '2', enter, enter, '\x15', '0', '\x1bOQ']) h.component.handleInput(key);
    if (omit) h.component.handleInput('\x1b[3~');
    for (const key of [tab, up, enter]) h.component.handleInput(key);
    assert.deepEqual(h.replies, [{ action: 'accept', content: omit ? {} : { count: 2 } }]);
  }
});

// Break: duplicate labels and clipped prefixes conceal the selected value's meaningful suffix before Send.
test('complete selected enum values remain inspectable in the same scrollable window', () => {
  const parts = Array.from({ length: 160 }, (_, index) => `part_${String(index).padStart(3, '0')}`);
  const first = `${parts.join(' ')} CHOICE_A_END`;
  const second = `${parts.join(' ')} CHOICE_B_END`;
  const h = fixture({ destination: { type: 'string', oneOf: [{ const: first, title: 'Same label' }, { const: second, title: 'Same label' }] } });
  for (const key of [enter, down, enter]) h.component.handleInput(key);
  let views = '', previous;
  for (let page = 0; page < 100; page++) {
    const screen = h.screen(); views += screen;
    if (screen === previous) break;
    previous = screen; h.component.handleInput('\x1b[6~');
  }
  assert.match(views, /Response value.*destination/);
  assert.match(views, /CHOICE_B_END/);
  assert.ok(parts.every(part => views.includes(part)), 'All parts of the selected value, not only its suffix, must be readable.');
  assert.doesNotMatch(views, /CHOICE_A_END/);
  assert.deepEqual(h.replies, [], 'Inspecting a selected value is not consent.');
  for (const key of [tab, up, enter]) h.component.handleInput(key);
  assert.deepEqual(h.replies, [{ action: 'accept', content: { destination: second } }]);
});

// Break: a very short viewport hides context/actions but still accepts blind submission keys.
test('a terminal below twelve rows pauses submission, preserves drafts and still permits cancellation', () => {
  const h = fixture({ note: { type: 'string' } }, { rows: 24 });
  h.component.handleInput(enter); h.component.handleInput('kept');
  const normal = h.component.render(80);
  const y = normal.findIndex(line => line.replace(/[│→]/gu, '').trim() === 'Send response');
  h.tui.terminal.rows = 8; h.component.invalidate();
  const paused = h.component.render(80);
  for (const key of [tab, up, enter]) h.component.handleInput(key);
  const event = { button: 'left', x: 4, y, screenX: 4, screenY: y, width: 80, height: 8, shift: false, alt: false, ctrl: false };
  h.component.handleMouse({ ...event, type: 'press' }); h.component.handleMouse({ ...event, type: 'click' });
  assert.deepEqual(h.replies, [], 'A paused form cannot send unseen data.');
  assert.ok(paused.length <= 6); assert.match(paused.join('\n'), /paused|resize/i);
  h.tui.terminal.rows = 24; h.component.invalidate();
  assert.match(h.screen(80), /kept/);
  for (const key of [tab, up, enter]) h.component.handleInput(key);
  assert.deepEqual(h.replies, [{ action: 'accept', content: { note: 'kept' } }]);
  const small = fixture({ approve: { type: 'boolean' } }, { rows: 8 });
  small.component.handleInput('\x1b'); assert.deepEqual(small.replies, [{ action: 'cancel' }]);
});
