# AITuning

**72 skills for coding agents, job searches, and learning.**

AITuning is a collection of agent skills written in Markdown. Each skill
describes how to handle a particular task, with scripts and references where
needed.

For code that looks wrong but may have a reason to exist,
[dig](skills/engineering/dig/SKILL.md) asks the agent to check the history before
making a change.

| Collection | What it's for |
|---|---|
| [flowstate](#flowstate-engineering) | Software engineering, from planning through release. |
| [trajectory](#trajectory-careers) | Job searches, applications, interviews, and offers. |
| [knowing](#knowing-learning-and-research) | Research, lessons, tutoring, and interactive explanations. |

The collections are independent plugins. Flowstate also has
[11 optional packs](#optional-flowstate-packs) for work such as UI design and
Python development.


## Contents

- [Start here](#start-here)
- [Skills](#skills)
- [Tools](#tools)
- [Evaluation toolkit](#evaluation-toolkit)
- [Additional Pi extensions](#additional-pi-extensions)
- [Requirements](#requirements)
- [Privacy and permissions](#privacy-and-permissions)
- [License and sources](#license-and-sources)

## Start here

For Claude Code, clone this repository and run these commands from its root:

```text
claude plugin marketplace add .
claude plugin install flowstate@aituning
```

Choose an independent collection or an optional pack when you need it:

```text
claude plugin install trajectory@aituning
claude plugin install knowing@aituning
claude plugin install flowstate-design@aituning
```

Install flowstate before a flowstate pack. You do not need flowstate to use
trajectory or knowing. The [marketplace manifest](.claude-plugin/marketplace.json)
lists all available plugins.

For an agent that reads skill folders, copy the complete skill directories into
its configured skills directory. Keep `SKILL.md`, `agents/`, and supporting files
together. Install any skills they load by name too. Code mode has a separate
[portable companion skill](mods/code-mode/skills/code-mode/SKILL.md).

Use [flow](skills/productivity/flow/SKILL.md) to choose an engineering skill.
Skills marked
`disable-model-invocation: true`, including figure, need an explicit invocation.

## Skills

### flowstate: engineering

Flowstate has **34 core skills**, split between engineering and productivity.
The [flowstate guide](skills/README.md) explains how they connect.

#### Engineering

| Skill | Use it to |
|---|---|
| [trace](skills/engineering/trace/SKILL.md) | Map unfamiliar code and follow how a feature works. |
| [dig](skills/engineering/dig/SKILL.md) | Find the history and reasoning behind a design or workaround. |
| [research](skills/engineering/research/SKILL.md) | Check technical facts against documentation and outside sources. |
| [domain](skills/engineering/domain/SKILL.md) | Define shared terms and record architecture decisions. |
| [modules](skills/engineering/modules/SKILL.md) | Design useful module boundaries and interfaces. |
| [proof](skills/engineering/proof/SKILL.md) | Make invalid states and easy caller mistakes harder to express. |
| [audition](skills/engineering/audition/SKILL.md) | Compare alternatives before an expensive choice becomes fixed. |
| [spec](skills/engineering/spec/SKILL.md) | Turn accepted intent into a specification or capability record. |
| [ticket](skills/engineering/ticket/SKILL.md) | Split a specification into linked implementation tickets. |
| [streamline](skills/engineering/streamline/SKILL.md) | Find gaps, deadlocks, and unowned work across specs and tickets. |
| [build](skills/engineering/build/SKILL.md) | Implement a ticket or work through a ticket graph. |
| [tdd](skills/engineering/tdd/SKILL.md) | Work test-first through the red-green loop. |
| [diagnose](skills/engineering/diagnose/SKILL.md) | Reproduce failures and investigate their causes. |
| [gates](skills/engineering/gates/SKILL.md) | Make lint, type, test, and boundary checks block broken changes. |
| [harden](skills/engineering/harden/SKILL.md) | Review security risks, untrusted inputs, and unsafe defaults. |
| [audit](skills/engineering/audit/SKILL.md) | Review a change against its base, standards, and requirements. |
| [doubt](skills/engineering/doubt/SKILL.md) | Ask a fresh adversarial reviewer to challenge a decision. |
| [crosscheck](skills/engineering/crosscheck/SKILL.md) | Have another agent engine review a plan and assess its findings. |
| [feedback](skills/engineering/feedback/SKILL.md) | Assess review comments before making changes in response. |
| [evidence](skills/engineering/evidence/SKILL.md) | Check the proof behind a completion or success claim. |
| [refine](skills/engineering/refine/SKILL.md) | Improve working code that is hard to read or change. |
| [optimize](skills/engineering/optimize/SKILL.md) | Measure performance changes while preserving behavior. |
| [merge](skills/engineering/merge/SKILL.md) | Resolve overlapping changes without losing their intent. |
| [integrate](skills/engineering/integrate/SKILL.md) | Verify finished branch work and choose how to integrate it. |
| [pr](skills/engineering/pr/SKILL.md) | Write a clear pull request description. |
| [release](skills/engineering/release/SKILL.md) | Prepare a version, changelog, release checks, and rollback plan. |
| [wizard](skills/engineering/wizard/SKILL.md) | Guide the human-only steps in provisioning or setup. |

#### Productivity

| Skill | Use it to |
|---|---|
| [flow](skills/productivity/flow/SKILL.md) | Choose a workflow and see how the skills connect. |
| [grill](skills/productivity/grill/SKILL.md) | Stress-test a plan, design, or idea before work starts. |
| [survey](skills/productivity/survey/SKILL.md) | Get answers from someone else through a focused questionnaire. |
| [what](skills/productivity/what/SKILL.md) | Re-explain the last message in plain language. |
| [handoff](skills/productivity/handoff/SKILL.md) | Leave context and next steps for a fresh agent or colleague. |
| [retro](skills/productivity/retro/SKILL.md) | Review an agent session and improve its working environment. |
| [tune](skills/productivity/tune/SKILL.md) | Write and test skills, prompts, and agent instructions. |

### Optional flowstate packs

The packs add **25 skills** to flowstate. The .NET, TypeScript, Python, and Rust
packs each pair a `guards` skill for project checks with a `seams` skill for
module boundaries.

| Pack | Skills | What it adds |
|---|---|---|
| Product | [discover](packs/product/skills/discover/SKILL.md), [ideate](packs/product/skills/ideate/SKILL.md), [sketch](packs/product/skills/sketch/SKILL.md) | Research opportunities, develop a concept, and test a throwaway prototype. |
| Setup | [setup](packs/setup/skills/setup/SKILL.md), [adopt](packs/setup/skills/adopt/SKILL.md), [rig](packs/setup/skills/rig/SKILL.md) | Prepare a project, bring existing plans into the flow, and document a repeatable app test rig. |
| Writing | [prose](packs/writing/skills/prose/SKILL.md), [draft](packs/writing/skills/draft/SKILL.md) | Edit for the reader or develop a new piece with its author. |
| Design | [compose](packs/design/skills/compose/SKILL.md), [craft](packs/design/skills/craft/SKILL.md), [critique](packs/design/skills/critique/SKILL.md), [codify](packs/design/skills/codify/SKILL.md), [animate](packs/design/skills/animate/SKILL.md), [image-assets](packs/design/skills/image-assets/SKILL.md) | Build and review interfaces, define visual rules, add motion, and create image assets. |
| Diagram | [diagram](packs/diagram/skills/diagram/SKILL.md) | Create diagrams tied to the system or material they explain. |
| Data | [validate](packs/data/skills/validate/SKILL.md) | Check an analysis, its calculations, and whether its conclusions follow. |
| .NET | [guards-dotnet](packs/dotnet/skills/guards-dotnet/SKILL.md), [seams-dotnet](packs/dotnet/skills/seams-dotnet/SKILL.md) | Enforce C# and .NET checks, project boundaries, and architecture rules. |
| TypeScript | [guards-typescript](packs/typescript/skills/guards-typescript/SKILL.md), [seams-typescript](packs/typescript/skills/seams-typescript/SKILL.md) | Enforce Node and TypeScript checks, package boundaries, and import rules. |
| Python | [guards-python](packs/python/skills/guards-python/SKILL.md), [seams-python](packs/python/skills/seams-python/SKILL.md) | Enforce Python checks, package boundaries, and import rules. |
| Rust | [guards-rust](packs/rust/skills/guards-rust/SKILL.md), [seams-rust](packs/rust/skills/seams-rust/SKILL.md) | Enforce Cargo checks, crate boundaries, and visibility rules. |
| Jev | [jev](packs/jev/skills/jev/SKILL.md) | Use separately configured judgment tools to check, classify, compare, and extract. |

### trajectory: careers

Trajectory has **seven skills**. CVs and interview answers draw on a candidate
fact file. The [trajectory guide](trajectory/README.md) explains that file, the
private workspace, and application records.

| Skill | Use it to |
|---|---|
| [profile](trajectory/skills/profile/SKILL.md) | Build a candidate fact file and set your search targets. |
| [scout](trajectory/skills/scout/SKILL.md) | Find openings and collect postings from company job boards. |
| [evaluate](trajectory/skills/evaluate/SKILL.md) | Check eligibility, fit, and whether a role is worth applying to. |
| [tailor](trajectory/skills/tailor/SKILL.md) | Produce role-specific CVs, cover letters, and checked PDFs. |
| [track](trajectory/skills/track/SKILL.md) | Record applications, replies, interviews, and follow-ups. |
| [interview](trajectory/skills/interview/SKILL.md) | Prepare and practice answers from the candidate's experience. |
| [offer](trajectory/skills/offer/SKILL.md) | Review an offer and prepare negotiation or lawyer questions. |

### knowing: learning and research

Knowing has **six skills**. You can use it for a single research question or
return for lessons and practice over time. The [knowing guide](knowing/README.md)
explains the learner folder and sources.

| Skill | Use it to |
|---|---|
| [understand](knowing/skills/understand/SKILL.md) | Map unfamiliar material, its claims, and a useful reading order. |
| [investigate](knowing/skills/investigate/SKILL.md) | Research a question and weigh sources that disagree. |
| [latest](knowing/skills/latest/SKILL.md) | Catch up on recent developments, releases, and research. |
| [learn](knowing/skills/learn/SKILL.md) | Study through lessons, spaced practice, and a learning log. |
| [tutor](knowing/skills/tutor/SKILL.md) | Teach from a learner's own work and target misconceptions. |
| [figure](knowing/skills/figure/SKILL.md) | Create an interactive physical-mechanism illustration on explicit invocation. |

## Tools

These tools are optional and separate from the 72 registered skills.

| Tool | What it does | Guide |
|---|---|---|
| Image zoom | Inspect an image through an overview grid, full-resolution crops, and tiles. | [MCP setup](mcp/image-zoom/README.md) |
| Code mode | Compose tool calls and filter large intermediate results before they reach the model. | [Setup and routing](CODE_MODE.md) |
| Readiness | Discover local prerequisites without launching tools or reading client settings or credentials. | [Dependencies by workflow](DEPENDENCIES.md) |
| Pi task continuation | Nudge unfinished, unblocked tasks within finite limits and record explicit waiting conditions. | [Extension guide](extensions/pi-task-continuation/README.md) |

Use code mode when filtering or aggregation saves the model from reading a large
tool result. For compact results, use direct tools. Code mode does not change
tool permissions or required delegation. Its guide covers the optional Claude
Code broker and Pi's native runtime.

Task continuation requires Pi 1.3.0, Node.js 24 or later, and separately supplied
`rpiv-todo`. Copying or exporting the package does not install or enable it.
Read its guide before loading it into a session.

## Evaluation toolkit

The optional [evaluation toolkit](evals/README.md) checks skill structure and
compares how agents respond to different instructions. It includes graders and
synthetic fixtures. The toolkit adds no skill descriptions to normal agent
context.

| Tool | Use it to |
|---|---|
| [validate.mjs](evals/validate.mjs) | Check skill structure and constraints. |
| [triggers.mjs](evals/triggers.mjs) | Check lexical trigger ranking and collisions. |
| [behave.mjs](evals/behave.mjs) | Plan and run controlled behavior comparisons. |
| [micro.mjs](evals/micro.mjs) | Compare wording variants, with an explicit offline planning mode. |

From `evals`, run `npm test` for the offline checker and harness tests. Model
targets start disabled. Read the guide before authorizing live work: behavior
execution needs `--run`, while wording comparisons need `--plan` to stay offline.
Recorded results and private provider settings are not included.

### Advanced evaluation

These runners share the [evaluation toolkit guide](evals/README.md):

| Tool | Use it to |
|---|---|
| [ab.mjs](evals/ab.mjs) | Plan A/B comparisons across judgment tasks. |
| [route.mjs](evals/route.mjs) | Plan model-based routing against skill descriptions and trigger prompts. |
| [xreview.mjs](evals/xreview.mjs) | Compare Claude and Codex plan reviews with independent judging. |
| [plugin-eval.mjs](evals/plugin-eval.mjs) | Plan plugin evaluations; live execution cannot publish. |
| [trends.mjs](evals/trends.mjs) | Analyze saved results without calling a model. |
| [propose.mjs](evals/propose.mjs) | Plan passage proposals, critiques, and blind judging. |
| [run-checks.mjs](evals/run-checks.mjs) | Run an authorized command with durable receipts, or inspect its saved status. |

Live evaluations require explicit opt-in, models, effort settings, and your
chosen accounts. Cross-review keeps Claude and Codex roles distinct. Credential
refresh write-back is opt-in. The public A/B datasets are new synthetic
examples, not recorded benchmark results or evidence of model quality.

The receipt runner executes the command you authorize. It is not a sandbox;
review the executable, arguments, environment, and working directory first.

## Additional Pi extensions

Read the [extension overview](extensions/README.md) before installing these
optional packages. Each package has its own host requirements and known limits.

| Extension | What it adds | Prerequisite or limit |
|---|---|---|
| [Herdr prompts](extensions/pi-herdr-prompts/README.md) | Report human-input waits to Herdr. | Requires Herdr's separately installed managed integration. |
| [MCP mirror](extensions/pi-mcp-mirror/README.md) | A session MCP connector with form elicitation. | Unreleased; keep its elicitation companion beside it and qualify the host setup. |
| [Elicitation companion](extensions/pi-mcp-elicitation/README.md) | Collect form answers and request separate consent. | Standalone native MCP use needs the pinned source patch; export does not apply it. |
| [Predictive compaction](extensions/pi-predictive-compaction/README.md) | Prepare checkpoints in the background. | Includes SDK patch-support source, not an applied patch or installation qualification. |

Installed Pi files, credentials, server endpoints, and user preferences are not
included. The export does not install or enable these extensions.

## Requirements

Reading the skills needs no runtime. Bundled JavaScript helpers and readiness
need Node.js 24 or later. Image zoom needs Python 3.12 or later and uv. Other
workflows can require browsers, document tools, model CLIs, or external services.
The [dependency table](DEPENDENCIES.md) lists those requirements by workflow.

Run `node tools/readiness.mjs` to find local prerequisites without changing
files. Add `--for <workflow>` to narrow the report. Finding an executable does
not verify its account, service, or host setup.

The image-assets skill needs a separately installed system imagegen skill and
tool. The Jev pack needs separately configured judgment tools and a server;
read its [setup guide](packs/jev/skills/jev/SETUP.md). Choose installations,
service access, and paid calls explicitly.

## Privacy and permissions

Keep your CV, application records, learner notes, credentials, and results in a
private workspace. Review proposed changes and the evidence behind completion
claims.

Read each tool's guide for setup and known limits. This repository contains
source, not installed tools. Exporting it does not install dependencies, enable
extensions, apply SDK patches, or authorize model calls. Personal machine
settings, private research records, and development history are omitted.

## License and sources

AITuning is [MIT licensed](LICENSE). Bundled dependencies and adapted material
retain their own licenses and credits. Keep the [third-party notices](THIRD_PARTY_NOTICES.md)
when redistributing it. The [flowstate](skills/README.md#sources-and-licenses),
[trajectory](trajectory/README.md#sources-and-licences), and
[knowing](knowing/README.md#sources-and-licences) guides document their sources.
