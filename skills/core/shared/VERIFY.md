# Verifying security findings

A candidate finding is not a finding until it survives an attempt to kill it. Keep finding and judging apart: collect candidates first, then verify each one in a separate pass (a fresh sub-agent where the harness has them), because whoever produced a candidate tends to defend it.

## 1. Restate it

Write each candidate as one line: **attacker** (who, from where) → **capability** (what they control) → **trigger** (the input or sequence) → **impact** (what they gain). Many candidates fall apart here: no attacker controls the input, or nothing is gained.

## 2. Try to kill it

Start from "not real" and take the first check that fails. The candidate stands only if every check survives:

1. **Reachable?** Can the trigger reach this code in the deployed product, not only in a test, script, or dead branch?
2. **Controlled?** Does the attacker control the value that actually arrives here, after the validation and defaults on the way in?
3. **Real impact?** Does it change what someone can read, write, run, or deny, beyond a crash in a path only the operator hits?
4. **Not already blocked?** Does the environment already prevent it (a framework guard, a proxy, a platform setting)? Read the guard; don't assume it.

A trace you can't finish is recorded as **unverified**, never reported as confirmed. Ask the question both ways: "am I reacting to scary-looking code?" and "am I crediting a protection I never actually read?"

## 3. Account for every candidate

Every candidate ends with a verdict: **confirmed** (with its severity and a proof-of-concept sketch for Critical), **refuted** (with the check that killed it), or **unverified** (with what's missing). A candidate with no verdict is a coverage gap: list it.

## 4. Look for chains

After the batch, check whether refuted or minor findings combine: an information leak plus a guessable token, or two low-severity bypasses in sequence, can make one real finding.

## When to dismiss a report

Dismissal tests for a claimed vulnerability (after William Woodruff's "brocards", re-expressed):

- **No threat model**: no one is identified who gains anything.
- **Already on the other side**: the attacker would need more access than the exploit gives them.
- **Unused path**: nothing in the product reaches the code.
- **Correct per the standard**: the behaviour is what the specification requires, unless this implementation promised to be stricter.
- **Worse cure**: the fix would do more harm than the issue.
- **Score alone**: a CVE entry or severity score is not evidence of exploitability here.

A dismissed report is listed with the test that dismissed it, never dropped silently.
