# Planning identifiers

This plain reference owns the shared identity contract for specs and tickets, whichever tracker or local format holds them.

## Reserve spec identities

- A spec ID is two to five uppercase ASCII letters: `^[A-Z]{2,5}$`, for example `UI`, `AUTH`, `SYNC`, or `RETRO`. Capability specs and change specs have distinct IDs.
- Reserve across the complete project inventory: capability/change specs, retired artifacts, tracker entries, aliases, and known active worktrees. Case differences do not create another identity.
- Serialize reservations in one authoritative planning worktree or tracker. Use its existing work list, or an ID table in the existing planning location when no work list exists. Recheck that authoritative inventory before publishing; independent worktree searches cannot guarantee uniqueness.
- Keep the ID through revisions and retirement. A fundamentally different change gets a new ID and a supersedes link. Revision metadata is separate; retired IDs are never reused.
- Prefix cross-project references with the project identity; short IDs are unique within a project.

## Allocate tickets

- Every ticket has an owning change spec. For standalone work, create a thin owning change spec using the existing spec template rather than inventing a standalone ticket namespace.
- Concatenate its ID directly with exactly two digits: `AUTH01`, `AUTH02`. Allocate `01` through `99`; `00` is not an executable ticket.
- Allocate above the highest number ever published for that spec, including cancelled and superseded tickets in every known location. Never reuse or renumber published ticket numbers.
- Keep the ID for clarification or a scope-preserving repair. A materially different deliverable gets a new ticket ID and a supersedes link.
- At `99`, use a related change spec for a meaningful remaining slice. If there is no sensible split, record namespace exhaustion and resolve that scope decision. Keep existing tickets/dependencies intact; do not add a third digit or wrap around.

## Titles, aliases, and migration

- Put the short ID in titles, Spec fields, blocker lists, breakdowns, and handoffs. Native keys remain location/API aliases: `AUTH01 (GitHub #412)`; native dependency links still use native keys.
- Retain legacy IDs as aliases with an explicit mapping. Migrate active identities and their live references together; preserve historical names and mappings instead of bulk-renaming old artifacts.
- Paths can stay `.scratch/<feature>/spec.md` and `issues/01-<slug>.md`. Identity does not depend on a filename, tracker number, or current revision.
- Keep cancelled/superseded artifacts and their evidence. Their closure does not establish prerequisite delivery (below).

## Satisfying a blocking edge

This contract owns when a blocker stops blocking; other skills point here. Closing an item never proves delivery. An edge is satisfied only by one of:

- the prerequisite delivered, with the ticket's named delivery evidence at its stated boundary;
- a superseded blocker's reconciled replacement that delivers the same prerequisite;
- an approved change to the edge, recorded where the edge lives: removing or waiving the prerequisite, or retiring the requirement that needed it.

A cancelled blocker satisfies nothing on its own. Already delivered work keeps its evidence; removing delivered behavior needs its own removal or migration ticket, not a retroactive cancellation.
