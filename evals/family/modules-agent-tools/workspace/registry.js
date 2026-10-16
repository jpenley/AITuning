// Stand-in for our MCP server layer: the agent host calls listTools() (MCP tools/list) and
// callTool(name, args) (MCP tools/call). The real transport gets wired up later; this file stays as is.
//
// A tool is a plain object:
//   { name, description, inputSchema, annotations, handler }
// inputSchema is JSON Schema for the arguments; annotations is MCP's ToolAnnotations object.
// handler(args) returns (or resolves to) an MCP CallToolResult:
//   { content: [{ type: 'text', text }], structuredContent?, isError? }
// Whatever the handler returns or throws goes straight back to the host.

function createRegistry(tools) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    listTools: () =>
      tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })),
    callTool: async (name, args = {}) => {
      const tool = byName.get(name);
      if (!tool) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
      return tool.handler(args);
    },
  };
}

module.exports = { createRegistry };
