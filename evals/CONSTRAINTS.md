# Public evaluation constraints

These constraints belong to the optional toolkit. They do not supply model choices or replace the consuming project's policies.

## Enforced

| Dimension | Rule | Checked by |
|---|---|---|
| Checker integrity | Detect the planted invalid inputs and references | `npm run selftest` |
| Skill structure | Zero errors | `node validate.mjs` |
| Trigger routing | Rank-1 rate at least 85%; zero collisions | `node triggers.mjs --min-rank1 85` |

Behavior scores require explicit model execution and review of the raw evidence. Offline structural checks and synthetic fixtures establish no model behavior verdict.
