# Optional Pi extensions

These packages are source exports for Node 24+ and the documented Pi 1.3.0
builds. Exporting them does not install or activate them. Review each guide's
limits and qualify your own installation before using real servers or models.

| Package | Purpose | Boundary |
|---|---|---|
| [Task continuation](pi-task-continuation/README.md) | Bounded task nudges and explicit blockers | Requires separately supplied RPIV |
| [Herdr prompts](pi-herdr-prompts/README.md) | Report human-input waits | Requires Herdr's separately installed managed integration |
| [MCP mirror](pi-mcp-mirror/README.md) | Opt-in session MCP connector with form elicitation | Includes the sibling collector; stock host stays unpatched |
| [Elicitation companion](pi-mcp-elicitation/README.md) | Collect form answers and ask for separate consent | Standalone native MCP use requires the pinned source patch |
| [Predictive compaction](pi-predictive-compaction/README.md) | Prepare checkpoints in the background | Requires explicit qualification and SDK patching before use |

Keep the sibling package layout. Do not load the elicitation collector twice
when using MCP mirror. Host peers and dependency packages are supplied separately;
this is not an air-gapped bundle or a qualified standalone npm tarball.

MCP mirror and standalone elicitation remain unreleased. This export does not
qualify clean dependency staging or package-manager installation. Historical
Windows native-test failures remain documented, not waived.

Predictive compaction retains its existing OpenAI GPT-6 Luna, medium-effort model.
Exporting it does not select that model for other work or authorize paid calls.
Loading starts prediction off only when no enabled preference already exists.
Session diagnostics can start even while prediction is off.

No credentials, MCP endpoints, preferences, installed SDK bytes, backups, or
private qualification receipts are included. Patch-support source and legacy
patch recognition are included, but no patch is applied during export. Third-party
[MIT notices](../LICENSES/pi-native.txt) remain applicable to native-derived material.
