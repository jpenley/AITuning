import { display, valid, validateContent } from './form.mjs';

export function canPresentForm(ctx, kit) {
  return ctx.mode === 'tui' && typeof ctx.ui?.custom === 'function' && kit &&
    ['Editor', 'SelectList', 'getKeybindings', 'matchesKey', 'truncateToWidth', 'visibleWidth', 'wrapTextWithAnsi'].every(name => typeof kit[name] === 'function');
}

// Server text stays data. Keep its paragraph boundaries, not terminal controls.
const paragraphs = value => String(value).replace(/\r\n?/gu, '\n').split('\n').map(display);
const unsafeInput = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

/** One interaction owns both editing and the explicit final send decision. */
export function createFormView(form, { tui, theme, keybindings, kit, signal }, done) {
  const values = Object.create(null);
  let closed = false, focused = false, area = 'fields', mode = 'fields', fieldIndex = 0;
  let fieldList, choiceList, editor, error = '', requestOffset = 0;
  let fieldBudget = 6, choiceIndex = -1, bounds = { requestHeight: 1, requestMax: 0 };
  let requestCache;
  const paint = (token, text) => theme.fg(token, text);
  const listTheme = {
    selectedPrefix: text => paint('accent', text), selectedText: text => paint('accent', text),
    description: text => paint('muted', text), scrollInfo: text => paint('dim', text), noMatch: text => paint('error', text),
  };
  const label = field => display(field.schema.title || (field.name === 'approve' ? 'Approval' : field.name));
  const valueText = field => Object.hasOwn(values, field.name) ? display(JSON.stringify(values[field.name])) : field.required ? 'Not answered' : 'Not included';
  function fieldDetails(field) {
    if (!field) return [];
    const schema = field.schema, limits = [`Type: ${schema.type}`];
    for (const [key, title] of [['minimum', 'min'], ['maximum', 'max'], ['minLength', 'min characters'], ['maxLength', 'max characters'], ['minItems', 'min selections'], ['maxItems', 'max selections'], ['format', 'format']]) {
      if (Object.hasOwn(schema, key)) limits.push(`${title}: ${schema[key]}`);
    }
    return [...(schema.description ? paragraphs(schema.description) : []), limits.join(' | '),
      ...(Object.hasOwn(schema, 'default') ? [`Suggested default (not selected): ${display(JSON.stringify(schema.default))}`] : [])];
  }
  function reviewRows(inner, selected, details) {
    const draft = mode === 'text';
    const value = draft ? editor.getExpandedText() : selected && Object.hasOwn(values, selected.name) ? values[selected.name] : undefined;
    const encoded = value === undefined ? undefined : JSON.stringify(value);
    const key = JSON.stringify([inner, fieldIndex, draft, encoded]);
    if (requestCache?.key !== key) {
      const request = ['Server message (untrusted text)', ...paragraphs(form.message),
        ...(selected ? ['', `Field details: ${label(selected)}`, ...details] : []),
        ...(encoded === undefined ? [] : ['', `Response ${draft ? 'draft' : 'value'}: ${display(selected.name)} (not sent)`, display(encoded)]),
        `Requester: ${display(form.server)}`, `Configuration source: ${display(form.source)}`];
      requestCache = { key, rows: request.flatMap(line => kit.wrapTextWithAnsi(`| ${line}`, inner)) };
    }
    return requestCache.rows;
  }
  const redraw = () => { if (!closed) tui.requestRender(); };
  const needsResize = () => (tui.terminal?.rows ?? 30) < 12;
  const syncFocus = () => { if (editor) editor.focused = focused && area === 'fields' && mode === 'text'; };
  function finish(action) {
    if (closed) return;
    if (signal?.aborted) action = 'cancel';
    let response = { action };
    if (action === 'accept') {
      if (mode === 'text' && !saveEditor()) { area = 'fields'; syncFocus(); return; }
      const invalid = form.fields.findIndex(field => Object.hasOwn(values, field.name) ? !valid(field, values[field.name]) : field.required);
      if (invalid >= 0) {
        fieldIndex = invalid; mode = 'fields'; area = 'fields';
        error = `Provide a valid response for ${label(form.fields[invalid])}. Nothing sent.`;
        refreshFields(); syncFocus(); redraw(); return;
      }
      try { response = { action, content: JSON.parse(JSON.stringify(validateContent(form, values))) }; }
      catch { error = 'The response exceeds form limits. Nothing sent.'; redraw(); return; }
    }
    closed = true;
    done(response);
  }
  const actions = new kit.SelectList([
    { value: 'accept', label: 'Send response' },
    { value: 'decline', label: 'Decline request' },
    { value: 'cancel', label: 'Cancel' },
  ], 3, listTheme);
  actions.setSelectedIndex(1); // Consent is never the initial decision.
  actions.onSelect = item => finish(item.value);
  actions.onCancel = () => finish('cancel');

  function refreshFields() {
    fieldList = new kit.SelectList(form.fields.map((field, index) => ({ value: String(index),
      label: `${label(field)}${field.required ? ' *' : ''}`, description: valueText(field),
    })), fieldBudget, listTheme);
    fieldList.setSelectedIndex(fieldIndex);
    fieldList.onSelectionChange = item => { fieldIndex = Number(item.value); };
    fieldList.onSelect = () => editField();
    fieldList.onCancel = () => finish('cancel');
  }
  function store(field, value) {
    if (value === undefined) delete values[field.name];
    else values[field.name] = value;
    error = ''; refreshFields();
  }
  function leaveEditor() { mode = 'fields'; syncFocus(); redraw(); }
  function discardEditor() {
    error = ''; area = 'fields'; leaveEditor();
    if (editor) { editor.onSubmit = undefined; editor.onChange = undefined; editor = undefined; }
  }
  function saveEditor() {
    const field = form.fields[fieldIndex], text = editor.getExpandedText();
    const value = field.schema.type === 'string' ? text : numeric.test(text) ? Number(text) : undefined;
    if (unsafeInput.test(text) || !valid(field, value)) {
      error = `Check ${label(field)} against its stated format or limits.`; redraw(); return false;
    }
    store(field, value); leaveEditor(); return true;
  }
  function editField() {
    const field = form.fields[fieldIndex];
    if (!field) return;
    error = '';
    if (field.schema.type === 'boolean' || field.choices) {
      mode = 'choices'; choiceIndex = -1; refreshChoices();
    } else {
      mode = 'text';
      editor = new kit.Editor(tui, { borderColor: text => paint('border', text), selectList: listTheme }, { paddingX: 0 });
      editor.setText(Object.hasOwn(values, field.name) ? String(values[field.name]) : '');
      // Editor's chat submit clears and trims its value. Form values must do neither.
      editor.disableSubmit = true;
    }
    syncFocus(); redraw();
  }
  function refreshChoices() {
    const field = form.fields[fieldIndex], multiple = field.schema.type === 'array';
    const choices = field.schema.type === 'boolean' ? [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] : field.choices;
    const items = choices.map((choice, index) => ({ value: String(index),
      label: `${multiple ? (values[field.name]?.includes(choice.value) ? '[x] ' : '[ ] ') : ''}${display(choice.label)}`,
      description: field.schema.type === 'boolean' ? '' : display(JSON.stringify(choice.value)),
    }));
    if (multiple) items.push({ value: 'done', label: 'Done choosing' });
    if (!field.required) items.push({ value: 'omit', label: 'Leave this field out' });
    choiceList = new kit.SelectList(items, fieldBudget, listTheme);
    if (!multiple && choiceIndex < 0) {
      const selected = choices.findIndex(choice => Object.hasOwn(values, field.name) && choice.value === values[field.name]);
      choiceIndex = selected >= 0 ? selected : field.schema.type === 'boolean' ? 1 : 0;
    }
    choiceIndex = Math.max(0, choiceIndex);
    choiceList.setSelectedIndex(choiceIndex);
    choiceList.onSelectionChange = item => { choiceIndex = items.findIndex(candidate => candidate.value === item.value); };
    choiceList.onSelect = item => {
      if (item.value === 'omit') { store(field, undefined); leaveEditor(); return; }
      if (item.value === 'done') { store(field, values[field.name] ?? []); leaveEditor(); return; }
      const choice = choices[Number(item.value)];
      if (multiple) {
        const selected = values[field.name] ?? [];
        store(field, selected.includes(choice.value) ? selected.filter(value => value !== choice.value) : [...selected, choice.value]);
        refreshChoices(); redraw();
      } else { store(field, choice.value); leaveEditor(); }
    };
    choiceList.onCancel = () => finish('cancel');
  }
  refreshFields();

  function scrollRequest(delta) { requestOffset = Math.max(0, Math.min(bounds.requestMax ?? 0, requestOffset + delta)); redraw(); }
  const component = {
    get focused() { return focused; },
    set focused(value) { focused = value; syncFocus(); },
    cancel() { finish('cancel'); },
    invalidate() { requestCache = undefined; fieldList.invalidate(); choiceList?.invalidate(); editor?.invalidate(); },
    handleInput(data) {
      if (closed || signal?.aborted) return;
      if (kit.matchesKey(data, 'escape') || kit.matchesKey(data, 'ctrl+c') || keybindings?.matches?.(data, 'app.interrupt')) { finish('cancel'); return; }
      if (needsResize()) return;
      if (kit.matchesKey(data, 'pageUp') || kit.matchesKey(data, 'pageDown')) { scrollRequest(kit.matchesKey(data, 'pageUp') ? -bounds.requestHeight : bounds.requestHeight); return; }
      if (mode !== 'fields' && kit.matchesKey(data, 'f2')) { discardEditor(); return; }
      if (kit.matchesKey(data, 'tab') || kit.matchesKey(data, 'shift+tab')) {
        // Invalid input must never trap the user away from Decline or Cancel.
        if (area === 'fields' && mode === 'text') saveEditor();
        area = area === 'fields' ? 'actions' : 'fields'; syncFocus(); redraw(); return;
      }
      if (area === 'actions') actions.handleInput(data);
      else if (mode === 'choices') choiceList.handleInput(data);
      else if (mode === 'text') {
        if (kit.getKeybindings().matches(data, 'tui.input.submit')) { saveEditor(); return; }
        const before = editor.getExpandedText();
        editor.handleInput(data);
        if (!closed && mode === 'text') {
          const text = editor.getExpandedText();
          if (unsafeInput.test(text) || [...text].length > 8192) {
            editor.setText(before); error = 'That edit contains unsafe controls or exceeds 8192 characters. Nothing sent.';
          }
        }
      } else if (kit.matchesKey(data, 'delete') || kit.matchesKey(data, 'backspace')) {
        const field = form.fields[fieldIndex]; if (field) store(field, undefined);
      } else fieldList.handleInput(data);
      redraw();
    },
    render(width) {
      if (closed) return ['MCP request closed.'];
      width = Math.max(1, width);
      if (needsResize()) {
        bounds = { requestHeight: 1, requestMax: 0 };
        return ['MCP request paused.', 'Need at least 12 rows.', 'Resize or Esc to cancel.']
          .slice(0, Math.max(1, (tui.terminal?.rows ?? 30) - 2)).map(line => kit.truncateToWidth(line, width, '…'));
      }
      const height = Math.max(10, Math.min(36, (tui.terminal?.rows ?? 30) - 2));
      const framed = width >= 12 && height >= 18, inner = Math.max(1, width - (framed ? 4 : 0));
      const compact = height < 18;
      const header = compact ? [paint('accent', `MCP: ${display(form.server)}`)] : [paint('accent', 'MCP request'), `From: ${display(form.server)}`];
      const decisionHeading = compact ? [] : [paint(area === 'actions' ? 'accent' : 'muted', 'Decision - Send response is final consent')];
      const backControl = mode === 'fields' ? [] : [paint('accent', mode === 'text' ? 'F2: Discard edit, back to fields' : 'F2: Back to fields')];
      const hint = area === 'actions' ? 'Enter decide | Tab fields | Esc cancel' : mode === 'text' ? 'Enter save | Tab actions | Esc cancel' : mode === 'choices' ? 'Enter choose | Tab actions | Esc cancel' : compact ? 'Enter edit | Tab actions' : 'Enter edit | Del omit | Tab actions | Esc cancel';
      const footer = [...decisionHeading, ...actions.render(inner),
        ...(error ? [paint('error', error)] : compact ? [] : [paint('muted', 'Editing does not send. Defaults are not selected.')]),
        ...(compact && error ? [] : [paint('dim', hint)])];
      const selected = form.fields[fieldIndex], details = fieldDetails(selected);
      // Compact inline help; the request pane also holds the complete, scrollable text.
      const fieldHelp = compact ? [] : details.slice(0, selected?.schema.description ? 2 : 1).map(line => paint('muted', line));
      const available = Math.max(2, height - header.length - footer.length - fieldHelp.length - backControl.length - 2 - (framed ? 2 : 0));
      const requestHeight = Math.max(1, Math.min(10, Math.floor(available / 2)));
      const nextBudget = Math.max(1, Math.min(7, available - requestHeight));
      if (nextBudget !== fieldBudget) { fieldBudget = nextBudget; refreshFields(); if (mode === 'choices') refreshChoices(); }
      const requestRows = reviewRows(inner, selected, details);
      requestOffset = Math.max(0, Math.min(requestOffset, Math.max(0, requestRows.length - requestHeight)));
      const requestLabel = inner >= 40 ? `Review details ${requestOffset + 1}-${Math.min(requestRows.length, requestOffset + requestHeight)}/${requestRows.length} (PgUp/PgDn)` : `PgUp/Dn ${requestOffset + 1}/${requestRows.length}`;
      let fields = mode === 'text' ? editor.render(inner) : mode === 'choices' ? choiceList.render(inner) : fieldList.render(inner);
      let editorOffset = 0;
      if (mode === 'text' && fields.length > fieldBudget) {
        const cursor = fields.findIndex(line => kit.CURSOR_MARKER && line.includes(kit.CURSOR_MARKER));
        editorOffset = Math.max(0, cursor - fieldBudget + 1);
        fields = fields.slice(editorOffset);
      }
      fields = fields.slice(0, fieldBudget);
      const fieldLabel = mode === 'fields' ? 'Response fields (* required)' : `Response: ${label(selected)}${selected.required ? ' *' : ''}`;
      const rows = [...header, paint('muted', requestLabel), ...requestRows.slice(requestOffset, requestOffset + requestHeight),
        paint(area === 'fields' ? 'accent' : 'muted', fieldLabel), ...fieldHelp, ...fields, ...backControl, ...footer];
      bounds = { requestY: header.length + 1, requestHeight, requestMax: Math.max(0, requestRows.length - requestHeight),
        fieldsY: header.length + 1 + Math.min(requestRows.length, requestHeight) + 1 + fieldHelp.length, fieldsHeight: fields.length };
      bounds.backY = backControl.length ? bounds.fieldsY + fields.length : undefined;
      bounds.actionsY = bounds.fieldsY + fields.length + backControl.length + decisionHeading.length;
      bounds.editorOffset = editorOffset;
      const fitted = rows.map(line => kit.truncateToWidth(line, inner, '…'));
      if (!framed) return fitted;
      bounds.requestY++; bounds.fieldsY++; bounds.actionsY++;
      if (bounds.backY !== undefined) bounds.backY++;
      return [paint('border', `┌${'─'.repeat(width - 2)}┐`), ...fitted.map(line => `${paint('border', '│')} ${line}${' '.repeat(Math.max(0, inner - kit.visibleWidth(line)))} ${paint('border', '│')}`), paint('border', `└${'─'.repeat(width - 2)}┘`)];
    },
    handleMouse(event) {
      if (closed || signal?.aborted || needsResize()) return;
      const x = event.x - ((event.width >= 12 && (tui.terminal?.rows ?? 30) - 2 >= 18) ? 2 : 0);
      const activates = event.button === 'left' && ['press', 'click'].includes(event.type);
      if (event.y >= bounds.requestY && event.y < bounds.requestY + bounds.requestHeight && event.type === 'wheel') {
        scrollRequest(event.wheelDelta ?? 0); return { handled: true, render: true };
      }
      if (bounds.backY !== undefined && event.y === bounds.backY && activates) {
        area = 'fields'; syncFocus();
        if (event.type === 'click') discardEditor();
        return { handled: true, render: true };
      }
      if (event.y >= bounds.actionsY && event.y < bounds.actionsY + 3) {
        // Hover/wheel never take keyboard ownership; only the completed action can submit.
        if (activates) { area = 'actions'; syncFocus(); }
        return actions.handleMouse?.({ ...event, x, y: event.y - bounds.actionsY });
      }
      if (event.y >= bounds.fieldsY && event.y < bounds.fieldsY + bounds.fieldsHeight) {
        if (activates) { area = 'fields'; syncFocus(); }
        const child = mode === 'text' ? editor : mode === 'choices' ? choiceList : fieldList;
        return child.handleMouse?.({ ...event, x, y: event.y - bounds.fieldsY + (mode === 'text' ? bounds.editorOffset : 0) });
      }
    },
    dispose() {
      closed = true;
      requestCache = undefined;
      for (const key of Object.keys(values)) delete values[key];
      if (editor) { editor.focused = false; editor.onSubmit = undefined; editor.onChange = undefined; }
    },
  };
  return component;
}

export async function presentForm(form, ctx, signal, kit) {
  if (signal.aborted) return { action: 'cancel' };
  let component, timer;
  // custom() has no AbortSignal option. Defer completion until its factory has mounted.
  const abort = () => { timer ??= setTimeout(() => component?.cancel(), 0); };
  try {
    return await ctx.ui.custom((tui, theme, keybindings, done) => {
      component = createFormView(form, { tui, theme, keybindings, kit, signal }, done);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      return component;
    });
  } finally {
    signal.removeEventListener('abort', abort);
    if (timer !== undefined) clearTimeout(timer);
    component?.dispose();
  }
}
