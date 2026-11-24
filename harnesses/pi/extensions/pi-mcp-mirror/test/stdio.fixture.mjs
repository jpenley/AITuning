// Synthetic remote peer only. stdout is reserved for newline-delimited JSON-RPC.
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const auditPath = process.argv[2];
assert.ok(auditPath, 'stdio fixture requires its isolated audit path');
const audit = event => appendFileSync(auditPath, JSON.stringify(event) + '\n', 'utf8');
const send = message => process.stdout.write(JSON.stringify(message) + '\n');
let initializeCount = 0, listCount = 0, callCount = 0, pendingCall, clientCapabilities;
audit({ event: 'started', pid: process.pid });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  const message = JSON.parse(line);
  assert.equal(message.jsonrpc, '2.0');
  audit({ event: 'received', message });
  if (!Object.hasOwn(message, 'method')) {
    assert.equal(message.id, 'entry-form');
    assert.notEqual(pendingCall, undefined, 'elicitation response needs a live tool call');
    const result = { pid: process.pid, initializeCount, listCount, callCount,
      wire: message, clientCapabilities,
      isolation: { cwd: process.cwd(), home: process.env.HOME, agentDir: process.env.PI_CODING_AGENT_DIR } };
    send({ jsonrpc: '2.0', id: pendingCall,
      result: { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false } });
    pendingCall = undefined;
    return;
  }
  if (!Object.hasOwn(message, 'id')) {
    assert.equal(message.method, 'notifications/initialized');
    return;
  }
  const reply = result => send({ jsonrpc: '2.0', id: message.id, result });
  switch (message.method) {
    case 'initialize':
      initializeCount++;
      clientCapabilities = message.params.capabilities;
      reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {} },
        serverInfo: { name: 'default-entry-local-peer', version: '1' } });
      break;
    case 'tools/list':
      listCount++;
      reply({ tools: [{ name: 'ask', description: 'Default entry native form',
        inputSchema: { type: 'object', properties: {} } },
        { name: 'discover', description: 'Default entry regression needle',
          inputSchema: { type: 'object', properties: {} } }] });
      break;
    case 'tools/call':
      callCount++;
      assert.equal(message.params.name, 'ask');
      assert.deepEqual(message.params.arguments, {});
      assert.equal(pendingCall, undefined);
      pendingCall = message.id;
      send({ jsonrpc: '2.0', id: 'entry-form', method: 'elicitation/create', params: {
        message: 'Choose offline falsy values', requestedSchema: { type: 'object',
          properties: { flag: { type: 'boolean' }, count: { type: 'integer' } },
          required: ['flag', 'count'] },
      } });
      break;
    case 'ping': reply({}); break;
    default: throw new Error(`Unexpected fixture request: ${message.method}`);
  }
});
// EOF is the ordinary transport shutdown path; no server/network/credential access.
lines.on('close', () => { audit({ event: 'stdin-closed', pid: process.pid }); });
