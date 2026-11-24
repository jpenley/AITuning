# Console automation bridges

Prefer an existing app-specific bridge when it exposes the real visible surface and user input. Rendered controls inside one console need not have child window handles; do not invent control discovery or treat a console as a web page.

- Launch the authorized workspace with its documented automation flags and pacing. Read the project's bridge guide rather than copying another app's flags or discovery metadata.
- Take a semantic snapshot before acting. Use its live text, dimensions, cursor, revision, and automation state as the source for coordinates and evidence.
- After a screen-changing action, wait for a semantic condition (text presence or absence, revision, cursor, state), then capture another snapshot. Fixed sleeps and headless simulations do not prove the visible transition.
- Physical input has priority. Stop synthetic input, inspect the changed screen, and use the documented resume operation after the user yields control. Continue from observed state instead of replaying stale steps.
- Label a text or JSON snapshot as semantic evidence, not a bitmap. When an image is required, capture the actual visible surface after semantic verification.
- Snapshots can contain sensitive information. Keep them out of unrelated logs and preserve the bridge's payload, timeout, client, and current-user restrictions. Input injection does not bypass authorization or confirmation prompts.
- Record cleanup separately from client disconnect: some bridges leave the app running after disconnect. Use the documented quit operation for an instance this run owns, and report if it remains open.

On a missing session or timeout, inspect current process/discovery state and a fresh snapshot, then correct the condition or preceding action. Do not fabricate session identifiers, edit discovery metadata, or use unbounded retries. Report when a visible desktop or compatible bridge is unavailable.
