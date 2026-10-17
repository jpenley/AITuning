# Code mode setup and routing

Use direct tools for compact reads, searches and edits. Use code mode when a script can discard substantial intermediate data or compute an aggregate before returning it to the model. A batch alone is not a reason to switch.

- [Set up Claude Code](#set-up-claude-code)
- [Pi](#pi)
- [Agent instructions](#agent-instructions)
- [Measured tradeoffs](#measured-tradeoffs)
- [Permissions and verification](#permissions-and-verification)

## Set up Claude Code

From this checkout, install the optional companion through its separate marketplace:

```text
claude plugin marketplace add ./mods
claude plugin install code-mode@aituning-mods
```

Restart Claude Code or run `/reload-plugins`. The mod includes its self-contained QuickJS broker, dependency licenses and the optional `code-mode` skill. It needs Claude Code 2.1.293+ and Node.js 20+ on PATH. Using the prebuilt broker needs no npm install; the distribution's other JavaScript helpers require Node.js 24+.

Read the [mod README](mods/code-mode/README.md) for API examples, resource limits, offline tests and development dependencies. Confirm `mcp__code-mode__execute` in the client before using it. The optional skill adds one description only when installed; it is outside the fourteen family plugins. No installation command changes your global routing policy automatically.

## Pi

Use Pi's native implementation. From the checkout, a single invocation can enable it and load the portable skill explicitly:

```text
pi --tools +codemode --skill ./mods/code-mode/skills/code-mode
```

For persistent skill discovery, copy the complete `mods/code-mode/skills/code-mode/` folder to `~/.pi/agent/skills/code-mode/` or the consuming project's `.pi/skills/code-mode/`. Keep its reference and metadata files. Review the project skill before granting trust. Pi also supports `.agents/skills/`. The skill does not install or invoke the Claude broker in Pi.

Merge this setting into an existing Pi configuration if you want native code mode available in later sessions:

```json
{
  "defaultTools": ["+codemode"],
  "codemode": { "mode": "on" }
}
```

Preserve existing settings when merging. Mode `on` keeps directly exposed tools available; `only` hides their direct declarations. Pi MCP servers can default to code-mode exposure. For a server where you want both routing choices, choose `exposure: "direct"` in that existing server's configuration. This selects presentation, not permission. Leave its endpoint, credentials, permission extensions and approval rules intact. Confirm available tools in the client; this package registers no MCP server.

See [Pi code mode](https://pi.dev/docs/latest/codemode), [CLI tools](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md) and [skill installation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md). Current client declarations take precedence over examples here.

## Agent instructions

The root [AGENTS.md](AGENTS.md) contains the shared routing and permission policy. [CLAUDE.md](CLAUDE.md) imports it. These files govern this checkout, not every project where a plugin is installed. For another workspace, merge the Tool composition paragraph into its existing AGENTS.md or global instructions. Preserve the workspace's model, delegation and permission rules. Keep a thin Claude import where needed.

The optional [code-mode skill](mods/code-mode/skills/code-mode/SKILL.md) packages the same policy with an invocation recipe and a complete [runtime reference](mods/code-mode/skills/code-mode/REFERENCE.md). Installing instructions does not make a missing runtime available. Use direct tools if no compatible code-mode tool is present.

## Measured tradeoffs

A bounded Pi 1.3.0 comparison used GPT-6.1 Sol at medium effort, five fresh matched pairs per workflow, and a local MCP replay of 12 public Pi issues and 61 comments. All 20 trials returned correct answers without tool errors. Changes below are paired medians for code mode relative to direct tools:

| Workflow | Peak request input | Cumulative input | Estimated API cost | End-to-end time |
|---|---:|---:|---:|---:|
| Compact issue lookup | -6.9% | +50.1% | +13.2% | +0.47 s |
| Cross-issue comment aggregation | -77.2% | -87.0% | -75.8% | -30.04 s |

These are workload observations, not universal savings. API cost is a catalog-based estimate, not an invoice. Cold startup and provider caching varied. Aggregation was faster in four of five pairs; one was 8.80 seconds slower. The MCP tools returned full objects, offered no field projection or server-side aggregate, and used four-record pages. Native filters or aggregate endpoints could reduce the benefit.

A separate 60-trial Claude Code file-tool comparison used Opus 5.5 medium and mod 0.2.1. Across that task mix, code mode used 4.0% less cumulative input, took 22.3% more end-to-end time and cost 12.8% more in API-equivalent estimates. That comparison reinforces selective routing; it does not predict Pi behavior. Historical raw traces and the benchmark harness are outside this public package.

## Permissions and verification

Code mode changes composition, not authority. Native Pi dispatch and the Claude mod preserve underlying tool permissions. The mod calls every action through `$.tool.call()` and installs no allow hook. Retain denials, tool errors, truncation and partial completion. Await independent reads before using their results, and keep dependencies and mutations sequential. A stopped script does not prove that an in-flight mutation was rolled back.

The benchmark's six offline permission probes passed allowed-read, denied-update and denied-scope cases through both Pi routes. Those probes exercise the stated boundaries, not every extension or sandbox escape. The companion's bundled offline tests cover dispatch, denial visibility, isolation, sequencing and limits. Client registration, real provider access and automatic skill loading require separate verification; a README, manifest or readiness result alone proves none of them.
