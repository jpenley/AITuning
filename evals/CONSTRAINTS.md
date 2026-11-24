# Public evaluation constraints

These constraints belong to the optional toolkit. They do not supply model choices or replace the consuming project's policies.

## Enforced

| Dimension | Rule | Checked by |
|---|---|---|
| Checker integrity | Detect the planted invalid inputs and references | `npm run selftest` |
| Skill structure | Zero errors | `node validate.mjs` |
| Trigger routing | The `trigger-rank1` minimum in `floor.json`; zero collisions | `node ../skills/core/engineering/audit/scripts/floor.mjs check --bundle` |

Behavior scores require explicit model execution and review of the raw evidence. Offline structural checks and synthetic fixtures establish no model behavior verdict.
