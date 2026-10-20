# flowstate

Engineering skills for planning, implementation, review, and release.

**Which skill when:** see [`flow`](productivity/flow/SKILL.md), the single source for how the skills connect.


## Contents

- [Conventions](#conventions)
- [Index](#index)
- [Project files the skills use](#project-files-the-skills-use)
- [Installation](#installation)
- [Sources and licenses](#sources-and-licenses)

## Conventions

- **Naming**: skills you type are one short verb; background skills are one noun. Stack-pack skills are `<concept>-<stack>`, such as `seams-dotnet`.
- **Harness-neutral**: skills load each other with "load the `x` skill with your skill tool"; user-only skills are suggested to the user, never loaded; context moves, sub-agents, background agents, and worktrees are described as concepts with a fallback where a harness lacks them. Full rules: [`tune/MECHANICS.md`](productivity/tune/MECHANICS.md).
- **Invocation markers**: user-only skills carry `disable-model-invocation: true` (Claude Code) and `agents/openai.yaml` with `allow_implicit_invocation: false` (Codex), kept in sync.
- **Line endings**: LF everywhere; shell scripts fail under CRLF.

## Index

| Skill | Invocation | Folder |
|---|---|---|
| audit | user + model | engineering |
| audition | user + model | engineering |
| build | user only | engineering |
| crosscheck | user only | engineering |
| diagnose | user + model | engineering |
| dig | user + model | engineering |
| domain | background | engineering |
| doubt | user + model | engineering |
| evidence | background | engineering |
| feedback | background | engineering |
| gates | background | engineering |
| harden | user + model | engineering |
| integrate | user only | engineering |
| merge | user + model | engineering |
| modules | background | engineering |
| optimize | user + model | engineering |
| pr | background | engineering |
| proof | user + model | engineering |
| refine | user + model | engineering |
| release | user only | engineering |
| research | user + model | engineering |
| spec | user only | engineering |
| streamline | user only | engineering |
| tdd | user + model | engineering |
| ticket | user only | engineering |
| trace | user + model | engineering |
| wizard | user + model | engineering |
| flow | user only | productivity |
| grill | user + model | productivity |
| handoff | user only | productivity |
| retro | user only | productivity |
| survey | user only | productivity |
| tune | user + model | productivity |
| what | user only | productivity |
| discover | user only | packs/product |
| ideate | user only | packs/product |
| sketch | user + model | packs/product |
| adopt | user only | packs/setup |
| setup | user only | packs/setup |
| rig | user only | packs/setup |
| prose | user + model | packs/writing |
| draft | user only | packs/writing |
| craft | user + model | packs/design |
| compose | user + model | packs/design |
| critique | user + model | packs/design |
| codify | user + model | packs/design |
| animate | user + model | packs/design |
| image-assets | user + model | packs/design |
| diagram | user + model | packs/diagram |
| validate | user + model | packs/data |
| guards-dotnet | user + model | packs/dotnet |
| seams-dotnet | user + model | packs/dotnet |
| guards-typescript | user + model | packs/typescript |
| seams-typescript | user + model | packs/typescript |
| guards-python | user + model | packs/python |
| seams-python | user + model | packs/python |
| guards-rust | user + model | packs/rust |
| seams-rust | user + model | packs/rust |
| jev | user + model | packs/jev |

## Project files the skills use

- `CONTEXT.md`, `docs/adr/`: written by `domain`.
- `docs/capabilities/<slug>.md` (lazy, or an established equivalent): observed current capabilities and scoped evidence; maintained as verified work lands. Change specs retain their baseline, target, and final Delta. See [capability contracts](engineering/spec/CAPABILITIES.md), [identifiers](engineering/spec/IDENTIFIERS.md), and [revision procedure](engineering/spec/REVISION.md).
- `docs/agents/issue-tracker.md` (optional): how to reach the tracker. Without it, specs and tickets are local files under `.scratch/<feature-slug>/`.
- `docs/agents/model-ladder.md`: the models `build`'s sub-agents work and promote through, and `doubt` reviews on; `setup` or `build` writes it from [`build/TASK-MODELS.md`](engineering/build/TASK-MODELS.md).
- `docs/agents/definition-of-done.md` (optional): the project's tailored Definition of Done, overriding `evidence/DONE.md`.
- `CONSTRAINTS.md` (optional): the enforced quality bar, with the floor guard.
- `CODING_STANDARDS.md` (optional): judgement-call standards `audit` enforces.

## Installation

See the [repository README](../README.md) for installation.

## Sources and licenses

The credits below describe the development sources. References to evaluation
tools and omitted development records describe that work, rather than files
shipped in this distribution.

- **BMAD Method, OpenSpec, and Spec Kit**: ideas re-expressed through existing skills; no upstream tooling, runtime, or copied instructions introduced. BMAD informed context maintenance and course correction; OpenSpec informed current/target/Delta separation; Spec Kit reinforced requirement-to-ticket traceability. The pinned study (private development record omitted) records source revisions and the implementation record (private development record omitted) distinguishes structural checks from pending behavior evaluation.

- **mattpocock/skills** — https://github.com/mattpocock/skills — MIT License, Copyright (c) 2026 Matt Pocock.
  `grill` (from `grilling`, `grill-with-docs`), `domain` (`domain-modeling`), `modules` (`codebase-design`), `diagnose` (`diagnosing-bugs`), `tdd`, `audit` (`code-review`), `spec` (`to-spec`), `ticket` (`to-tickets`), `build` (`implement`, `implement-spec`), `tune` (`writing-for-agents`), `pr`, `merge` (`resolving-merge-conflicts`), `sketch` (`prototype`), `research`, `refine` survey mode (`improve-codebase-architecture`, with ideas from `setup-ts-deep-modules`), `retro`, `handoff`, `what` (`wait-what`), `wizard` (template included, lightly modified), `survey` (`to-questionnaire`), `flow` (`ask-matt`), `setup` (`setup-matt-pocock-skills`). `draft` in the writing pack (from `writing-fragments`, `writing-shape`, `writing-beats`: the pile, grounding, candidate openings, block by block).
- **obra/superpowers** — https://github.com/obra/superpowers — MIT License, Copyright (c) 2025 Jesse Vincent.
  `feedback` (`receiving-code-review`); `evidence` (`verification-before-completion`); `integrate` (`finishing-a-development-branch`); `tdd/GOOD-TESTS.md` (`writing-good-tests.md`); in `audit`: severity tiers, the declined-to-judge list, and the vision-document rule; in `spec`/`ticket`: Global Constraints, Review Focus, and the coverage check; in `build`: rulings and worktree/baseline rules (`using-git-worktrees`); in `tune`: the testing method and the form-versus-failure table; in `retro`: deep-mode analysts (`diagnosing-superpowers`); in `diagnose`: independent-failure split (`dispatching-parallel-agents`). From the 2026-10-07 plugin review, ideas re-expressed: in `build`, a fresh reviewer for every delivery and, with `audit`, the scoped re-review after a fix (`subagent-driven-development`); `tdd/GOOD-TESTS.md`'s condition waits (`systematic-debugging/condition-based-waiting.md`); `retro/DEEP.md`'s request-conflicts dimension (`diagnosing-superpowers`).
- **addyosmani/agent-skills** — https://github.com/addyosmani/agent-skills — MIT License, Copyright (c) 2025 Addy Osmani.
  `doubt` (`doubt-driven-development`); `harden` and its checklist (`security-and-hardening`, `references/security-checklist.md`, the `security-auditor` persona); `release` (`shipping-and-launch`, `git-workflow-and-versioning`); `ideate` with `frameworks.md` and `refinement-criteria.md` (`idea-refine`); `refine` local mode (`code-simplification`); the floor guard and `CONSTRAINTS.md` (`constraint-driven-development`); `evidence/DONE.md` (`references/definition-of-done.md`); `modules/IDEMPOTENCY.md` (`api-and-interface-design`); `tune/ORCHESTRATION.md` (`references/orchestration-patterns.md`); the `evals/` design (their eval framework); and many rules folded into `audit`, `build`, `grill`, `spec`, `ticket`, `tdd`, `diagnose`, `research`, `handoff`, `sketch`, `setup`, and `tune`.
- **multica-ai/andrej-karpathy-skills** — https://github.com/multica-ai/andrej-karpathy-skills — MIT (stated in its README and manifest; the repo has no LICENSE file).
  The Working norms block in `setup`; in `build`: simplicity, scope ("every changed line should trace to the ticket"), and cleaning up only your own orphans; the scope-creep test in `audit`; the dead-code rule in `refine`.
- **open-gsd/gsd-core** — https://github.com/open-gsd/gsd-core — MIT License, Copyright (c) 2026 Open GSD.
  Stated failing direction (`ticket`, `evidence`, `audit`); backstop requirements and abstaining instead of passing (`spec`, `audit`, `evidence`, from `references/honest-verifier.md`); the reversibility rating (`doubt`, `spec`, `ticket`, `build`); assumptions mode in `grill`; the closest-analog step in `build` (the pattern mapper); read-only implementation when adding tests (`tdd`, from the Nyquist auditor); the curated-file shrink check in the floor guard; protected content in `tune`; the single-reviewer tag in `doubt`; the secret-file rule in `harden`; and in `evals/`, the size baseline and the ledger's "Does not cover" column.
- **garrytan/gstack** — https://github.com/garrytan/gstack — MIT License, Copyright (c) 2026 Garry Tan.
  In `build`: the decision classes (mechanical, taste, changes the user's direction), the `revisit when` trigger on shortcut rulings, the destructive-command list, stop signals in the fix loop, the implementer status set, and pre-existing-failure triage; in `grill`: taking a position with the evidence that would change it, and per-addition scope questions; the forcing questions in `ideate/frameworks.md`; the Failure Map in `spec` and the critical-gap rule in `audit`; quoting the code for every `audit` finding and the Unchecked New Value smell; the scope lock in `diagnose`; stop signals in `refine`; the shortcut review in `retro`; the claimed-limitation row in `evidence`; destructive commands under Ask first in `harden`; and in `evals/`, `--changed`, grader hints, the judge cache, hermetic Claude runs, and the description budget.
- **dietrichgebert/ponytail** — https://github.com/dietrichgebert/ponytail — MIT License, Copyright (c) 2026 DietrichGebert.
  The simplicity ladder and the "never simplify away" floor in `build` and the Working norms (`setup`); "grep every caller and fix the shared function once" in `build` and `diagnose`; "name the action, not the virtue" in `tune`; the `delete` / `stdlib` / `native` / `yagni` / `shrink` tags in `refine`; `shortcut:` code comments (`build`, `retro`); and in `evals/`, control arms, `--selftest` with good and bad references, the size-plus-completeness rule, and the `overbuild-date` case.
- **trailofbits/skills** — https://github.com/trailofbits/skills — CC BY-SA 4.0. **Ideas only, re-expressed in our own words; no text copied**, so no share-alike obligation attaches. `audit/VERIFY.md` (verifying security findings: restate, try to kill, a verdict per candidate, chains; the dismissal tests after William Woodruff's "brocards"); removed-code history and the six spec verdicts in `audit`; fail-open defaults, footgun APIs, supply-chain signals, and agents in CI in `harden/CHECKLIST.md`; the variant hunt and "reached the assertion" rule in `diagnose` and `evidence`; non-convergence escalation and command-checked scope in `build`; "close the cheap exits" in `ticket`; refuting delete recommendations in `integrate` and `refine`; other-vendor review hygiene and graded reporting in `doubt`; property-based tests in `tdd`; two rules in `tune`; and in `evals/`, self-tests for every checker, the unquoted-YAML check, the scaffolding warning, invalid-session handling, and grading rules.
- **Survey of skill collections (2026-09-25)**, ideas re-expressed:
  - **anthropics/skills** (Apache 2.0): skill-creator's eval practice (held-out split for description tuning, near-miss negatives, graders that critique their own assertions, flags for tests that pass in both arms or flip between runs, blind comparison, time and tokens) in `tune/TESTING.md` and `evals/`; reader testing from doc-coauthoring (no licence file, so the idea only) in `spec` and `handoff`.
  - **openai/skills** (Apache 2.0): security-threat-model, as `harden/THREAT-MODEL.md`.
  - **muratcankoylan/Agent-Skills-for-Context-Engineering** (MIT): the sub-agent return condition and does-not-count list in `build`; compaction and handoff practice (artifact trail, exact strings, incremental updates, probe questions) in `handoff`; clean-win acceptance, itemised edits, raw transcripts, locked yardsticks, and judge-order bias in `tune/TESTING.md`.
  - **github/awesome-copilot** (MIT): poka-yoke (github.com/rainmanjam/poka-yoke), as the new `proof` skill; test-gap-audit's citation and number rules in `evidence`, and its mocked-away tests as a `SMELLS.md` entry.
  - **ardalis.com, "Optimizing AI agents with progressive disclosure"**: `AGENTS.md` as a map, not the territory, in `setup`.
- **Humanlayer "show-me" skill** — https://github.com/humanlayer/skills (credited by mattpocock's `pr`): the PR body shape in `pr`.
- **uditgoenka/autoresearch** — https://github.com/uditgoenka/autoresearch — MIT License, Copyright (c) 2026 Udit Goenka.
  In `optimize`: committing each attempt and reverting with `git revert`, named attempt outcomes (crash, unreadable metric), reading the log before each attempt, and pinning the loop's commands verbatim; `discover` (from `improve`: the forced pass per research category, the insight row, confidence by source count, new/extension/duplicate, the saturation stop); in `evals/`, the `propose.mjs` loop (from `reason`) and `trends.mjs` (from `evals`).
- **wjgoarxiv/autoresearch-skill** — https://github.com/wjgoarxiv/autoresearch-skill — MIT License, Copyright (c) 2026 wjgoarxiv.
  In `optimize`: the frozen yardstick, re-measuring a suspiciously large win, a time limit per attempt, the plateau switch after 3 attempts without a win, and the attempt log as a file; in `retro`: a draft eval case for each proposed skill change (from `learn`).
- **Leonxlnx/unlazy** — https://github.com/Leonxlnx/unlazy — MIT License, Copyright (c) 2026 Leonxlnx.
  In `build`: declaring the files each parallel ticket owns, and never running two tickets whose files overlap at once; outside the skills, `hooks/checklist-gate.mjs` (the idea of its stop hook, rewritten).
- **jkudish/jev-mcp** — https://github.com/jkudish/jev-mcp — MIT License, Copyright (c) 2026 Joey Kudish.
  `jev` (from its `skills/jev`, rewritten as moments with conditions, plus a redaction step), with its `reference/tools.md` copied as `jev/TOOLS.md`. The Jev server is installed separately.
- **mermaid-js/mermaid-cli** — https://github.com/mermaid-js/mermaid-cli — MIT License. The tool the `diagram` skill drives (`mmdc` as the parse-and-render gate); not vendored, the user installs it. Ideas from **tt-a1i/archify** (MIT; evaluated in a private development record): tying diagram claims to source lines that a script checks, and reporting automated checks apart from a look at the image. The choice of Mermaid over the alternatives is in a private development record.
- **cursor/plugins pstack** (poteto-mode) — https://github.com/cursor/plugins/tree/main/pstack — MIT License, Copyright (c) 2026 Lauren Tan.
  In `optimize`: the strategy families keyed to profile signals (from `perf-issue`), the benchmark sensitivity check, naming the mechanism an attempt removes, and never relaxing the target (from `hillclimb`); in `build`: `scripts/worktree-audit.mjs` (from `worktree-audit.sh`), checking a silent implementer read-only, and stopping dispatch at about 70% of a time budget (from `playbooks/orchestrate.md`); in `retro`: history mode, `HISTORY.md` (from `automate-me`: mining time slices, keeping patterns seen in 2+ slices); `prose` (from `technical-writing`) and its `scripts/lint-prose.mjs` (the mechanical rules of `unslop`). Second pass: `dig` (from `why`: the code anchor, one investigator per source, the confidence tiers); `audition` (from `arena`: rubric first, a blind judge, pick a base and graft) and its pointer in `modules`' design-it-twice; `rig` (from `create-verification-skill`, `maintain-verification-skill` and its feature-map example, and benny's control adapter); in `diagnose`: checking for an existing fix and verifying it (from benny's `reproduce-and-fix-issues`); in `integrate`: CI failure triage (from `playbooks/babysit.md`); in `proof`: types built by construction (from `principle-type-system-discipline`); in `retro`: the self-sufficiency check (from `reflect`'s tooling reviewer). `trace` (from `how`, by way of knowing's `understand`): explaining how code works by reading it rather than guessing from names, naming what couldn't be traced, and the smallest complete answer first.
- **Egonex-AI/Understand-Anything** — https://github.com/Egonex-AI/Understand-Anything — MIT License, Copyright (c) 2026 Yuxiang Lin.
  In `trace` (moved from knowing's `understand`): a structural map of a codebase before reading it (import graph, entry points, most-imported files, cycles), a guided reading order, and a saved map checked for staleness against the commit it was built from (`trace/scripts/map.mjs`).
- **petergyang/no-ai-slop** — https://github.com/petergyang/no-ai-slop — MIT License, Copyright (c) 2026 Peter Yang.
  `prose`'s `VOICE.md` (voice-preserving edits of personal writing, the detect mode, the portability test), and in `scripts/lint-prose.mjs` the vague-attribution and superficial "-ing" rules, the u9 contraction forms, the u7 and u23 additions, and rules u34 to u40 (throat-clearing, fake insight, metadiscourse, rhetorical setups, puffery, negative listing, recap endings).
- **blader/humanizer** — https://github.com/blader/humanizer — MIT License, Copyright (c) 2025 Siqi Chen.
  In the writing pack: six judgement rules in `prose`'s `VOICE.md` (lead with what the reader needs, answer only objections someone raised, count what's there, vary a repeated opening, ask instead of guessing, point at what exists), and lint rules u41–u43, u45 and the chatbot offers in u20 (re-expressed from its pattern catalogue).
- **pbakaus/impeccable** — https://github.com/pbakaus/impeccable — Apache License 2.0, Copyright 2025 Paul Bakaus. Ideas only, re-expressed; no text or code copied, and nothing from its `ios.md`/`android.md`, the files its NOTICE attributes to ehmo/platform-design-skills (MIT).
  In the design pack: `craft`'s floor read before any UI edit, its numbers (contrast, line length, the text floors, motion durations), the four surface modes, and the bounded check (one fix round, one re-check); `detect.mjs`'s rule list (its detector's slop and quality rules, re-implemented on the rendered page); `critique`'s refusal to grade your own work; `codify`'s drift check against DESIGN.md tokens.
- **nexu-io/open-design** — https://github.com/nexu-io/open-design — Apache License 2.0, Copyright 2026 Open Design contributors. Ideas only, re-expressed.
  In the design pack: the split between a checkable floor and brand style; tells as findings fed back to the agent rather than bans; `codify`'s DESIGN.md sections and role-named tokens; `critique`'s evidence for every finding and scoring from the worst sustained problem.
- **leonxlnx/taste-skill** — https://github.com/leonxlnx/taste-skill — MIT License, Copyright (c) 2026 Leonxlnx.
  In the design pack: the catalogue of generic-UI tells behind `detect.mjs` (identical icon cards, an eyebrow on every section, em-dash saturation, placeholder names, invented metrics); `compose`'s one-line design read with at most one question and its "change the look, not the URLs, labels, field names, or legal copy" rule for restyles.
- **heygen-com/hyperframes** — https://github.com/heygen-com/hyperframes — Apache License 2.0, Copyright 2026 HeyGen, Inc. Ideas only, re-expressed for UI timescales.
  In the design pack: `animate`'s timing caps (entrances within about 500ms, exits about three quarters of the entrance, a whole stagger within 500ms, one curve per kind of motion) and checking motion by measuring rather than eyeballing.
- **affaan-m/ECC** — https://github.com/affaan-m/ECC — MIT License, Copyright (c) 2026 Affaan Mustafa. Ideas only, re-expressed.
  In `tune`'s ORCHESTRATION.md: the *Loops* gate (the task repeats, success is decided by a command, the budget covers it, the agent can run and read the check) and writing the limits against gaming the check beside it (`skills/loop-design-check`).
- **langgenius/dify** — https://github.com/langgenius/dify — modified Apache License 2.0. Ideas only, re-expressed; no text or code copied.
  In `research`: reading a CLI's command list and the one command's help before passing its flags (`cli/src/help/skill-template.ts`).
- **lllllllama/RigorPilot-Skills** — https://github.com/lllllllama/RigorPilot-Skills — MIT License, Copyright (c) 2026 Chengkun Rao. Ideas only, re-expressed; no programs or tooling imported.
  In `optimize`: completed outcomes require observed execution; candidate evidence and pending actions stay separate from the completed attempt table. Broader research/optimization additions were tested and rejected as redundant.
- **vercel-labs/web-interface-guidelines** — https://github.com/vercel-labs/web-interface-guidelines — MIT License, Copyright (c) 2025 Vercel Labs. Ideas only, re-expressed.
  In the design pack: `craft/INTERACTIONS.md`, shared with `critique`, covers form behavior, asynchronous feedback, navigation and drafts, keyboard and gesture alternatives, loading, locale/hydration, mobile overlays, and dark themes. Project style stays in DESIGN.md; interaction evidence is reported separately from visual checks.

- **Installed Claude Code plugins, reviewed 2026-10-07** (record: a private development record). Ideas only, re-expressed; no text copied.
  - **chrome-devtools-mcp** (Apache License 2.0, Google): `diagnose/PERF.md`'s heap-diff loop for memory that keeps growing (`memory-leak-debugging`); five `craft` detect rules (`a11y-debugging` and `debug-optimize-lcp` snippets).
  - **mcp-server-dev** (Apache License 2.0, Anthropic): `modules/AGENT-TOOLS.md` (`build-mcp-server` tool design and capabilities, `build-mcp-app` payload budgeting).
  - **hookify** (Apache License 2.0, Anthropic): `retro`'s tool-call guards.
  - **desktop-commander** (MIT): `wizard`'s check of each captured credential (`ai-tools-setup`).
  - **Anthropic knowledge-work plugins** (Apache License 2.0): `release`'s measured baseline, numeric triggers and watch window (engineering `deploy-checklist`); `discover`'s own-data mode (design `research-synthesis`, product-management `synthesize-research`); `validate`'s *Not supported* reasons (data `validate-data`'s pitfall catalogue); `craft` and `critique`'s reflow and 200% zoom check, `critique`'s WCAG criterion per accessibility finding and its *Not tested* line (design `accessibility-review`), `critique`'s stage-matched severities (design `design-critique`), and `codify`'s spacing and radius drift (design `design-system`), measured in a private development record; `domain`'s ADR *Revisit when* line (engineering `architecture`) and its key, formula, source and filter fields for a data project's glossary (data `data-context-extractor`), measured in a private development record. The verdict-per-claim shape is ours, written against a measured failure; a version that also carried the full pitfall catalogue scored the same at higher cost and was dropped (a private development record).
  - **claude.ai built-in skills** (no licence file; the idea only): `knowing/investigate`'s fan-out notes contract (`deep-research`, credited in `knowing/README.md`); `handoff`'s third-party-text rule (`morning`); `craft`'s newer generic-look tells (`artifact-design`); `diagram`'s option-comparison row and `accTitle`/`accDescr` (`artifact-diagramming`).
  - **skill-creator** (Apache License 2.0, Anthropic): claims graders in three `evals/family` cases (`agents/grader.md`).
- **edonadei/caliper** — [source at 0f94c3f](https://github.com/edonadei/caliper/tree/0f94c3fbd3df2dc74c64e927d47318d1f5ac8d6c) — MIT License, Copyright (c) 2026 Emrick Donadei. Ideas only, re-expressed; no upstream runtime installed or code copied.
  In `evals/behave.mjs`: selective skill removal with unchanged neighbors, content inventories, and recognized load-set diagnostics; `tune/TESTING.md` points to these controls. See the tested intake record (private development record omitted).
- **ibelick/ui-skills** — [source at ebf5f26](https://github.com/ibelick/ui-skills/tree/ebf5f26cd275b1412be8a2c8784c4f8da628e7c2) — MIT License, Copyright (c) 2026 Julien Thibeaut. Ideas only, re-expressed.
  Its focused motion-maintenance approach informed `animate`'s distinction between new motion and preserving an existing design while reducing implementation cost, including offscreen suspension. Proposed metadata and broader performance additions were redundant in the tested intake (private development record omitted); no upstream skill or CLI was installed.
- **Project-specific adaptations**: scope-aware proof in `evidence`; semantic console bridge guidance in `rig/CONSOLE.md`; isolated numerical probes, independent accuracy/cost gates, resolution controls, and reproducible negative results in `optimize/PROBES.md` (shared with `tdd`); domain-write scope and the Markdown questionnaire branch in `domain` and `survey`.
- **hardikpandya/stop-slop** — [MIT License](../packs/writing/skills/prose/STOP-SLOP-LICENSE.txt), Copyright (c) 2025 Hardik Pandya. The reviewed local adaptation's protected technical literals and claim-scope safeguards are incorporated into `prose`; pattern catalogs remain review signals rather than universal bans.
