# Threat model

For a new feature or system, before the code exists (or when an existing system has never had one). The checklist asks "did we do X?"; a threat model asks "who could do what to us, and how?". Ground it in this repo, not in a generic list.

## 1. Map what's there

Read the code and config, then list:

- **Entry points**: every way data or requests get in (HTTP routes, queues, webhooks, file uploads, CLI arguments, scheduled jobs, model or agent inputs).
- **Assets**: what's worth stealing, changing, or denying (credentials, personal data, money movement, admin actions, availability).
- **Trust boundaries**, as concrete edges between named components: "browser → API", "API → payments service", "CI job → production secrets". A boundary is anywhere the level of trust changes.

Keep **runtime** (the deployed product) separate from **build and CI** (pipelines, dependencies, developer machines): they have different attackers and different fixes.

## 2. Write abuse paths

For each boundary, write the ways across it as short paths: **who** (from where, with what access) → **does what** (the input or sequence) → **gets what** (the asset). Also write what that attacker **can't** do, so severity stays honest: an attacker who needs a valid admin session is not an anonymous one.

## 3. Rank them

Rank each path by **likelihood × impact**, and name the assumptions that drive the ranking ("assumes the admin panel is only reachable on the VPN"). Then **stop and ask the user to confirm those assumptions**. A path resting on an assumption they didn't confirm is marked **conditional**, not dismissed.

## 4. Check coverage, then hand off

Before finishing, confirm every entry point and every boundary from step 1 appears in at least one path or is explicitly marked "no plausible abuse" with the reason. Then:

- mitigations for the top paths become requirements: into the spec's **Failure Map** and **Review Focus**, or into tickets;
- the rest are listed as accepted risks, each with its reason.
