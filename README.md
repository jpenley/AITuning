# AITuning skills

Agent skills for engineering, job searches, learning, and research, plus an MCP
tool for inspecting large images. The skills are plain Markdown with supporting
references, templates, and scripts. An optional code-mode companion adds structured
tool composition while preserving the underlying tool permissions.

| Collection | Purpose | Start here |
|---|---|---|
| flowstate | Engineering from an idea through implementation and release | [Skill index](skills/README.md) |
| trajectory | Job-search profiles, postings, applications, interviews, and offers | [Career skills](trajectory/README.md) |
| knowing | Understanding material, investigations, lessons, and tutoring | [Learning skills](knowing/README.md) |
| image zoom | Inspect an image with an overview grid, full-resolution crops, and tiles | [MCP tool](mcp/image-zoom/README.md) |

Trajectory and knowing work independently. Optional flowstate packs add product,
setup, writing, design, diagram, data, Jev, and language-specific skills.


## Contents

- [Install plugins](#install-plugins)
- [Install individual skills](#install-individual-skills)
- [Optional code mode](#optional-code-mode)
- [Optional evaluation toolkit](#optional-evaluation-toolkit)
- [Requirements](#requirements)
- [License and sources](#license-and-sources)

## Install plugins

For Claude Code, clone this repository and run these commands from its root:

```text
claude plugin marketplace add .
claude plugin install flowstate@aituning
```

Install the independent collections and optional packs as needed:

```text
claude plugin install trajectory@aituning
claude plugin install knowing@aituning
claude plugin install flowstate-design@aituning
```

Install flowstate before a flowstate pack. The available plugins are listed in
[the marketplace manifest](.claude-plugin/marketplace.json).

## Install individual skills

For a harness that reads skill folders, copy a complete skill directory into its
configured skills directory. Keep `SKILL.md`, `agents/`, and every supporting file
together. Select the needed skills from these locations:

- `skills/engineering/<name>/` and `skills/productivity/<name>/`: flowstate core.
- `packs/<pack>/skills/<name>/`: optional flowstate skills; include their core dependencies.
- `trajectory/skills/<name>/`: career skills.
- `knowing/skills/<name>/`: learning and research skills.
- `mods/code-mode/skills/code-mode/`: optional portable tool-composition guidance.

Skills that load another skill by name need that skill installed too. Skills
marked `disable-model-invocation: true` require an explicit user invocation.

## Optional code mode

Read [code-mode setup and routing](CODE_MODE.md) for the complete guide and measured
tradeoffs. Prefer direct tools for compact results. Code mode is useful when filtering
or aggregation can discard substantial intermediate data before it reaches the model.

For Claude Code, the optional companion includes the self-contained broker,
dependency licenses, offline tests and one portable skill:

```text
claude plugin marketplace add ./mods
claude plugin install code-mode@aituning-mods
```

Pi uses its own native runtime. From this checkout, enable it and load the skill with:

```text
pi --tools +codemode --skill ./mods/code-mode/skills/code-mode
```

The root [AGENTS.md](AGENTS.md) contains the routing and permission policy;
[CLAUDE.md](CLAUDE.md) imports it. For other projects, merge the policy into their
existing instructions. Plugin installation does not change global instructions.
Keep model choices, permission prompts, hooks and required delegation intact.

## Optional evaluation toolkit

This copy includes the [evaluation toolkit](evals/README.md): offline checks,
comparison planning, prompts, graders and synthetic fixtures. Model targets
start disabled. Recorded results and private provider settings are omitted.
The toolkit is optional and adds no skill descriptions to normal agent context.

## Requirements

Reading the skills needs no runtime. Use Node.js 24 or later for the bundled
JavaScript helpers, readiness check and optional evaluation toolkit. The
[dependency table](DEPENDENCIES.md) lists required and optional tools by workflow.
Run `node tools/readiness.mjs` for optional local discovery or add `--for <workflow>`.
It launches no tools, reads no client settings or credentials, and changes no files.

Image zoom needs Python 3.12 or later and uv. Its [guide](mcp/image-zoom/README.md)
describes dependency installation and client registration. The image-assets skill
needs a separately installed system imagegen skill and tool. The optional Jev pack
needs a separately configured server and provider; read [Jev setup](packs/jev/skills/jev/SETUP.md).
Choose installations and service access explicitly for the workflow you use.

Skills are instructions for an agent. Review the agent's proposed changes and
the evidence behind its claims. Job-search files and learner records belong in
your own private workspace.

## License and sources

AITuning is [MIT licensed](LICENSE). Retain the
[upstream notices](THIRD_PARTY_NOTICES.md) when redistributing it. Each collection's
README credits its sources. Dependency packages retain their own licenses.

This distribution contains skills, image zoom and the optional code-mode companion.
The code-mode guide includes a bounded results summary. Other development research, plans,
private machine settings, recorded evaluation results, and their history are not
part of this copy.
