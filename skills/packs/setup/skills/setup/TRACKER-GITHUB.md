# Issue tracker: GitHub

Specs and tickets for this repo live as GitHub issues. Use the `gh` CLI for every operation; it infers the repo from `git remote -v` when run inside a clone.

## Operations

- **Create**: `gh issue create --title "..." --body-file <file>` (write multi-line bodies to a file first).
- **Read**: `gh issue view <number> --comments`, plus labels.
- **List**: `gh issue list --state open --json number,title,body,labels --jq '[.[] | {number, title, body, labels: [.labels[].name]}]'`, with `--label` / `--state` filters as needed.
- **Comment**: `gh issue comment <number> --body-file <file>`
- **Label**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

## Labels

- `ready-for-agent`: a spec or ticket fully specified for an agent to pick up.
- `needs-grill`: an adopted spec or ticket that carries a `## Gaps` section; `adopt <item>` brings it to `ready-for-agent`.

## Blocking

Use GitHub's native issue dependencies where the repo has them: `gh api --method POST repos/<owner>/<repo>/issues/<ticket>/dependencies/blocked_by -F issue_id=<blocker-database-id>`, where the database id comes from `gh api repos/<owner>/<repo>/issues/<n> --jq .id` (not the `#number`). Where dependencies aren't available, put a `Blocked by: #<n>, #<n>` line at the top of the ticket body. A ticket is unblocked only when every prerequisite's needed behavior has delivery evidence, or the dependency was explicitly reconciled through an authorized waiver or retirement of the dependent requirement. Closure alone is insufficient. A superseded blocker links its replacement; follow that link and recheck the dependency.

## Identity and revisions

Keep native issue numbers as operational keys. The spec body also carries its unique two-to-five-letter uppercase ID; ticket bodies carry that ID followed directly by 01–99, the bound spec revision, Delta entries, and disposition. Preserve old IDs as aliases, never reuse a retired ID, and reserve new IDs serially in the authoritative tracker/work list before parallel publication. Native closed state alone cannot distinguish delivered, cancelled, and superseded: record the disposition, reason, evidence or replacement link in the body and closing comment. Follow the core spec/ticket reference contracts for exact format and course correction.

## Parent links

Link tickets to their spec as sub-issues where available; otherwise put `Part of #<spec>` at the top of the ticket body.

## When a skill says...

- **publish**: create an issue.
- **fetch a ticket**: `gh issue view <number> --comments`.
- **mark a ticket done**: record delivered disposition and evidence, then close it with a comment naming the commit or PR. Cancellation or supersession uses its own disposition and replacement/reason; it is not delivery.
