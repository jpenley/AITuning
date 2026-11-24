import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup } from './stock.fixture.mjs';

// Break caught: connection error text bypasses the manager and enters native
// notifications with live OSC/CSI/bidi controls. Wire/error data stays untouched.
test('MCP command notifications encode untrusted connection errors before the UI boundary',
  { concurrency: false, timeout: 30000 }, async () => {
    const h = await setup({ factory: 'mirror' });
    try {
      await h.ready();
      const attack = 'peer error \x1b]52;c;aGVsbG8=\x07\x1b[2J\u202eend'
        .replaceAll('\x1b', '\x1b').replaceAll('\x07', '\x07').replaceAll('\u202e', '\u202e');
      h.failTransportWith(new Error(attack));
      await h.session.prompt('/mcp reconnect lab-docs');
      const errors = h.notifications.filter(value => value.type === 'error');
      assert.equal(errors.length, 1);
      const message = errors[0].message;
      assert.equal(message.includes('\x1b]52;'), false, 'notification cannot execute OSC');
      assert.equal(message.includes('\x1b[2J'), false, 'notification cannot execute CSI');
      assert.equal(message.includes('\u202e'), false, 'notification cannot reorder trusted framing');
      assert.equal(message.includes(String.raw`\u001b]52;`), true, 'show the rejected control visibly');
      assert.equal(message.includes(String.raw`\u202e`), true);
      assert.equal(h.transportState.created, 2);
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
