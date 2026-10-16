# Dependencies and optional readiness check

Use this reference when choosing a workflow or preparing another machine. Reading skills needs no runtime. Use Node.js 24 or later for the bundled JavaScript tools and optional evaluation toolkit. Other tools belong to the workflows that use them.

## Contents

- [Run local discovery](#run-local-discovery)
- [Read the result](#read-the-result)
- [Dependency table](#dependency-table)
- [Workflow selectors](#workflow-selectors)
- [Configure external services](#configure-external-services)

## Run local discovery

From this distribution's root:

```text
node tools/readiness.mjs
node tools/readiness.mjs --for design,diagram
node tools/readiness.mjs --for image-zoom,jev
node tools/readiness.mjs --all
node tools/readiness.mjs --for typescript --project /absolute/path/to/project
node tools/readiness.mjs --list
node tools/readiness.mjs --selftest
```

The default checks core engineering requirements. Every selection includes Node; each workflow adds its own requirements. The check is optional and loads no skill descriptions. It finds files on PATH, in known browser locations and in explicit project-local executable locations. The selftest uses in-memory fixtures.

No mode launches subprocesses, contacts a network endpoint, writes files, installs tools or reads client configuration and credentials. The check does not search package caches. A recipient can run it offline. The [catalog](tools/dependencies.json) generates this table and supplies the [checker](tools/readiness.mjs).

## Read the result

JSON goes to stdout and a short status goes to stderr. Each dependency names the selected workflows requiring it and those treating it as optional. Availability is `available`, `missing` or `unverified`. MCP and provider configuration stays `not-inspected`; an installed executable does not prove authentication or registration.

- Exit 0: selected local requirements were found. Read the limits before using the workflow.
- Exit 1: a required dependency is missing or unverified. Optional dependencies do not block.
- Exit 2: invalid options, an unreadable input or a checker error prevented discovery.

Only the running Node version is verified. Other executable versions, installed package dependencies, browser operation, provider access and project gates remain untested. Confirm those through the owning skill and client when you choose the workflow. A missing tool calls for an explicit installation choice, rather than an automatic repair.

## Dependency table

Required and optional columns contain workflow selectors. An asterisk means every selected workflow. Other requirements apply only to the selected workflow. The optional evaluation toolkit is present only in an export built with `AITUNING_PUBLIC_EVALS=1`.

| Dependency | Required for | Optional for | Scope and limits |
|---|---|---|---|
| Node.js 24+ | * | none | Required for every selected workflow. The running Node version is checked. Other executable versions are not queried. |
| Git | core, evals | none | File discovery only. Repository access and forge authentication are not tested. |
| Chrome, Edge or Chromium | design, career | none | The checker does not launch a browser or attach to a profile. |
| Mermaid CLI | diagram | none | Without it, diagram-check supports --no-render and reports that rendering is unverified. |
| Poppler pdftotext | career | none | Required for ATS text extraction, rather than PDF generation. |
| Python | image-zoom, image-assets-cli, python | none | Image zoom requires Python 3.12+. The imagegen fallback requires Python 3.10+. Interpreter versions are not executed or verified. |
| uv | image-zoom | none | First image-zoom use installs locked dependencies. This checker never invokes uv. |
| Bundled image-zoom server | image-zoom | none | Server files are included. Client registration and locked dependency installation remain separate. |
| Image-zoom client registration | image-zoom | none | Check the MCP client's tool list. Client settings and server state are not inspected. |
| System imagegen skill and CLI | image-assets, image-assets-cli | none | Install the complete upstream system skill separately. IMAGEGEN_SKILL_ROOT may select it. |
| Built-in image generation tool | image-assets | none | Confirm the tool in the current harness. Installed instructions cannot expose a missing tool. |
| Imagegen fallback dependencies and API access | image-assets-cli | none | The chosen fallback needs openai, pillow and local API credentials. None are imported, read or tested here. |
| Web and connected-browser tools | research | none | Confirm source access in the harness. Network and logged-in sessions are not tested. |
| Firecrawl MCP | none | research | Optional discovery/scraping route; the research skills retain ordinary web fallbacks. |
| curl | none | research, wizard | Used by source-specific fetches and wizard checks when those paths are selected. |
| yt-dlp | video | none | Used for caption retrieval. Installation and any download remain explicit actions. |
| Jev MCP server and provider | jev | none | Use the bundled Jev setup guide, then confirm tools in the client. Registration, credentials and provider calls remain unverified. |
| npx | none | jev | One upstream server launch route. A separately installed server can use another executable path. |
| Bash | wizard | evals | Wizard execution requires Bash. Eval shell-syntax coverage is optional and reports its own skipped coverage. |
| ShellCheck | none | wizard | Optional shell analysis when available. |
| GitHub CLI | github | wizard | Other forges use their own connectors. This checker never invokes gh or checks authentication. |
| Forge authentication | github | none | Confirm access through the chosen client separately; no credentials are read. |
| Bundled optional evaluation toolkit | evals | none | Included only with AITUNING_PUBLIC_EVALS=1. Offline checks need no model service. |
| Model CLI or API configuration | none | evals | Needed only for separately authorized live evaluations. Shipped model targets and judge start disabled. |
| .NET SDK | dotnet | none | The project's SDK and package versions remain unverified. |
| Cargo toolchain | rust | none | Compiler components and project-specific tools remain unverified. |
| Project test and architecture tooling | dotnet, typescript, python, rust | none | Use the consuming project's own SDKs, lockfiles and checks. This catalog does not install project dependencies. |

## Workflow selectors

- `core`: Engineering helpers.
- `design`: UI measurements and screenshots.
- `diagram`: Rendered Mermaid diagrams.
- `career`: Resume PDF rendering and ATS checks.
- `research`: Public-web research.
- `video`: Video captions.
- `image-assets`: Built-in image generation route.
- `image-assets-cli`: Explicitly chosen imagegen API fallback.
- `image-zoom`: Image zoom MCP server.
- `jev`: Jev judgment MCP server.
- `wizard`: Manual setup wizards.
- `github`: GitHub forge history and operations.
- `evals`: Optional evaluation toolkit.
- `dotnet`: .NET project checks.
- `typescript`: TypeScript project checks.
- `python`: Python project checks.
- `rust`: Rust project checks.

## Configure external services

Read [Jev setup](packs/jev/skills/jev/SETUP.md) for the optional server and provider, [image zoom](mcp/image-zoom/README.md) for its locked environment and MCP registration, and [image assets](packs/design/skills/image-assets/SKILL.md) for the separately installed system imagegen skill and fallback boundaries. Project language packs retain their own tool references.

Client tool availability requires confirmation in that client. Firecrawl retains a web fallback. Model access is needed only for explicitly requested live evaluations; shipped targets stay disabled. Keep settings and credentials local. The readiness report contains discovery evidence and never certifies an entire machine as ready.
