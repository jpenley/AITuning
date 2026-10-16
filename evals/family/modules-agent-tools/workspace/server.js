// What the agent host loads.
const { createRegistry } = require('./registry');
const tools = require('./tools');

module.exports = createRegistry(tools);
