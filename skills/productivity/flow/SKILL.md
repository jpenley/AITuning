---
name: flow
description: Which skill fits this situation? A map of the skill set, how the skills connect, and what to do between phases.
disable-model-invocation: true
---

# Flow

The user asked which skill or path fits. Read their situation, point to the skill (or path) below, and say why in a sentence. Skills are shown as `/name`; the user runs them with their harness's skill command.

**Packs**: most skills are in the core pack. `/discover`, `/ideate` and `/sketch` are in the **product** pack; `/setup`, `/adopt` and `/rig` in the **setup** pack; `prose` and `draft` in the **writing** pack; `craft`, `compose`, `critique`, `codify`, `animate` and `image-assets` in the **design** pack; `jev` in the **jev** pack (with the jev MCP server); `diagram` in the **diagram** pack (needs the Mermaid CLI); `validate` in the **data** pack; and `guards-<stack>` and `seams-<stack>` in the **dotnet**, **typescript**, **python** and **rust** packs. If the one you point to isn't available, tell the user how to install its pack. In Claude Code, use `claude plugin install flowstate-<pack>@aituning`. In a harness that reads skill folders, copy the complete skill directories from `packs/<pack>/skills/` into its configured skills directory, together with their core dependencies.

## First time in a project

**`/setup`** prepares it: tracker, model ladder, Definition of Done, constraints, line endings, ignores, optional standards and glossary, stack guardrails. Safe to re-run.

**Already has plans or a backlog?** After `/setup` picks the tracker, **`/adopt`** sweeps existing docs, other frameworks' plan files, and tracker issues into specs, tickets, ADRs, and glossary terms from one approved mapping plan. Re-run `/adopt` to finish items imported with gaps, one per session; `/adopt sweep` picks up sources added later.

**Want agents to prove changes in the running app?** **`/rig`** writes a standing recipe in `docs/agents/rig/` for launching the real app, driving it the way a user does, and capturing proof, plus a feature map, and runs it once before handing it over. `/rig check` keeps it true to the app after the app changes.

## The main flow: idea → released

0. **`/discover`** (when there's no idea yet, only a product and its users): research what to build next from evidence and rank it; each chosen item goes to `/ideate`.
1. **`/ideate`** (when the idea is still vague or greenfield): explore variations, converge on a direction, write a one-pager.
2. **`/grill`**: sharpen the chosen idea by interview until every decision is settled. In a repo it keeps `CONTEXT.md` and ADRs current as it goes.
3. **Can every question be settled in conversation?** If one needs a runnable answer (does this state model hold up, what should this look like), detour through **`/sketch`**, then bring the verdict back.
4. **`/spec`**: turn the conversation into a spec (Global Constraints, Boundaries, Review Focus; a capability map first when it spans several capabilities).
5. **`/ticket`**: split the spec into tracer-bullet tickets with blocking edges.
6. **`/build`**:
   - `/build <ticket>` for one ticket.
   - `/build <spec>` to work every ticket with parallel implementers into one PR.

   Either way sub-agents on the model ladder do the work.
7. **`/refine`** (optional): clean up the branch's changes without changing behaviour; `/integrate` offers it.
8. **`/integrate`**: verify, then merge locally, open or merge the PR, or keep the branch.
9. **`/release`**: pre-release checks, version, changelog, tag, rollback plan, post-deploy verification.

For small work that fits one session, skip `/spec` and `/ticket`: go from `/grill` straight to `/build`, or just to `/tdd`.

**Many specs and tickets in flight?** **`/streamline`** reviews them as one graph for what no single ticket's checks can see: blockers nobody named, deadlocks, requirements no ticket delivers, findings nobody owns. It files the fixes. Run it after `/adopt` finishes, after `/integrate` merges work while other tickets stay open, and whenever the plan has grown across many sessions.

**Keep steps 2-5 in one unbroken context** so the grilling, spec, and tickets build on the same thinking; each `/build <ticket>` then starts fresh from its ticket.

**The direction changed?** Use `/spec revise <ID>` to preserve the old approved intent, decide what to retire, and write the new revision; `/ticket revise <ID>` reconciles retained, revised, cancelled, and superseded slices before work resumes. `/streamline` then checks the live graph.

## On-ramps

- **Something's broken** → **`/diagnose`**: builds a feedback loop that fails on the bug before theorising.
- **Working code needs to be faster or leaner** → **`/optimize`**: isolates the algorithm, records its outputs as a golden master, then keeps only changes that leave them identical and beat the noise.
- **Need to know how code works** → **`/trace`**: a map of the codebase, a reading order, how a feature works end to end, or what a change touches, every claim cited to a file and line. The partner of `/dig`.
- **Need to know why code is the way it is** → **`/dig`**: the reason behind a value, a workaround, or a design, from the project's own history (commits, PR threads, tickets), with every claim marked by how well the record supports it. Before changing code whose purpose isn't clear.
- **Need facts from outside the repo** → **`/research`**: primary sources, cited; a quick lookup or a background report. Take it into `/grill`.
- **Need knowledge from someone else** → **`/survey`**: a plain-text questionnaire for email or chat. Take the answers into `/grill` or `/spec`.
- **Codebase getting hard to change** → **`/refine survey`**: surveys for deepening opportunities, grills the one you pick, enforces the boundary.

## Standalone

- **`/audit`**: review a branch or PR on standards, spec, and security.
- **`/doubt`**: adversarial fresh-context check of a decision before it stands.
- **`/crosscheck`**: the other agent engine reviews a spec, plan or ticket read-only against the code; each finding gets a verdict, and the log shows whether it earns its cost.
- **`/prose`**: long-form text people read (docs, posts, newsletters, essays, long emails), written or edited so it doesn't read as AI-made; also "is this AI slop?".
- **`/draft`**: write a new piece with the author from their notes, one block at a time.
- **`/compose`**, **`/craft`**, **`/critique`**, **`/codify`**, **`/animate`**: the design pack: build or restyle a UI, hold it to a quality floor, review it, keep DESIGN.md tokens, add motion. `image-assets` generates the raster images a UI needs.
- **`diagram`**: the diagram pack: draw a flow, sequence, state or ER diagram of a system as Mermaid, tied to source lines and checked with the Mermaid CLI.
- **`validate`**: the data pack: check an analysis, report, or query result before it's shared, with a verdict on every claim, even when asked only to check the arithmetic.
- **`/audition`**: several independent attempts at one brief, a blind judge, then the best as the base with the rest's best parts grafted in. For a choice expensive to reverse.
- **`/harden`**: security while building: threat model, controls, checklist.
- **`/merge`**: resolve a merge or rebase stuck on conflicts.
- **`/wizard`**: script the steps only a human can take (credentials, dashboards, cutovers).
- **`/handoff`**: move work to another harness, directory, or colleague.
- **`/what`**: the last message didn't land; re-explain it plainly.
- **`/tune`**: write or test a skill, `AGENTS.md` / `CLAUDE.md`, or prompt.
- **`/retro`**: after a session, find improvements to the agent's environment.

**Project context getting stale?** `/retro context` reviews purpose, conflicts, placement, loading, and evidence before retaining, clarifying, relocating, automating, or retiring guidance. `/tune` tests proposed instruction changes. Protective policy needs evidence for its hazard and enforcement; clean sessions alone do not justify deleting it.

## Underneath

Background skills that load when needed; reach for them directly only when their subject *is* the question:

- **`domain`**: the glossary and ADRs. Loaded by `grill`.
- **`modules`**: module design vocabulary, public interfaces, idempotency. Loaded by `tdd` and `refine`.
- **`feedback`**: acting on review findings. Fires on its own when findings arrive from `audit` or a reviewer.
- **`gates`**: the procedure for lint, type, test, hook, and CI checks and module-boundary rules in any stack, including a check that's red on existing code. Loaded by the `guards-<stack>` and `seams-<stack>` skills, and by `setup` for a stack with no pack.
- **`evidence`**: proof before claiming done, and the Definition of Done. Used by most skills before they report done.
- **`pr`**: the PR body shape. Used by `build` and `integrate`.
- **`proof`**: designing an API, schema, or workflow so callers can't get it wrong and invalid states can't be built.
- **`tdd`**: the red-green loop and what makes a test worth keeping. Used by `build`.

## Between phases

A **phase** is a chunk of work: the grilling, the implementation, the review. At the boundary between two, work down this list; the first *yes* wins:

1. **Continue?** Yes when the next phase needs this one's reasoning verbatim (grilling → implementation is the standard case), or there's room left for it. Continuing costs nothing and loses nothing, so rule it out first.
2. **Start a fresh context?** Yes when nothing here matters to what's next. Cheapest move; the old session usually stays resumable.
3. **Hand off?** Only when the work moves to another harness, directory, or colleague, or to fork a side task: **`/handoff`**.
4. **Sub-agent?** Yes when the next task is tightly scoped enough to run unattended (a review, a research question).
5. **Otherwise, compact** with an instruction about what comes next, so the summary keeps what the next phase needs.

Handing off and compacting turn the full conversation into a lossy summary, and a fresh context drops it; decide at the boundary, not mid-phase.
