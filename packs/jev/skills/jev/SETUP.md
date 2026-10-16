# Set up the optional Jev server

The Jev skill contains instructions and a pinned tool reference. Install and register the server separately when you choose this workflow. Follow the [upstream installation guide](https://github.com/jkudish/jev-mcp#install) and [provider configuration](https://github.com/jkudish/jev-mcp#configuration) for the version you select.

## Contents

- [Choose a server and provider](#choose-a-server-and-provider)
- [Register with the client](#register-with-the-client)
- [Confirm availability](#confirm-availability)

## Choose a server and provider

Use Node.js 24 or later for this distribution. Upstream publishes the server as `@jkudish/jev-mcp`. Its documented stdio launch command is:

```text
npx -y @jkudish/jev-mcp
```

Running this command can download the package into npm's cache. Pin an inspected package version for reproducible installations. The dependency checker never runs this command.

Choose a provider using the upstream guide. Provider calls send supplied content outside the agent and may incur charges. Configure credentials through your client's local secret or environment mechanism. Keep values out of chat, repository files and committed examples. If the client filters environment variables, use its supported method to pass the approved provider variables to the server.

## Register with the client

For a client accepting MCP stdio JSON, adapt this example to its configuration format:

```json
{
  "mcpServers": {
    "jev": {
      "command": "npx",
      "args": ["-y", "@jkudish/jev-mcp"]
    }
  }
}
```

Clients with another format use the same command and argument array. Prefer the client's documented configuration editor. On Windows, use a supported executable or shim path for that client. This example stores no credentials, endpoint or owner-specific setting. Reading it does not register or launch the server.

## Confirm availability

Use the client's tool list to confirm the Jev tools are exposed. Compare the installed server's live schema with the [pinned reference](TOOLS.md) before a first call. Upstream releases may add or change tools; the live schema defines the available call contract.

Tool discovery establishes registration, not provider access or judgment quality. A provider test is a separate authorized call with a bounded, non-sensitive example. Retain its actual result and cost. An unavailable server or failed call remains unverified.

The distribution's readiness check reports Jev registration and provider access as unverified. It does not read client settings, inspect credentials, list live tools or contact a provider. Return to [the skill](SKILL.md) for redaction and judgment policy.
