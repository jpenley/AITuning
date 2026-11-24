# Security checklist

The shared checklist for building (`harden`) and reviewing (`audit`'s Security axis). Stack-neutral; stack packs add the concrete commands and code patterns.

## Threat model

- [ ] Trust boundaries mapped, including LLM output and local values written by processes you don't control
- [ ] Assets named
- [ ] STRIDE run per boundary
- [ ] Abuse cases written next to use cases, the first ones as failing tests

## Commits

- [ ] No secrets in the staged diff
- [ ] `.gitignore` covers `.env*`, key files (`*.pem`, `*.key`), and build output
- [ ] `.env.example` holds placeholders, never real values

## Authentication and sessions

- [ ] Passwords hashed with bcrypt (12+ rounds), scrypt, or argon2
- [ ] Session secret from the environment, never from code
- [ ] Session cookies httpOnly, secure, sameSite lax or strict, with a bounded lifetime
- [ ] Login rate-limited (about 10 attempts per 15 minutes)
- [ ] Password-reset tokens time-limited (an hour or less) and single-use
- [ ] Account lockout and MFA for sensitive operations, where appropriate

## Authorization

- [ ] Every protected endpoint checks authentication
- [ ] Every resource access checks ownership or role (no IDOR)
- [ ] Admin operations require an admin role
- [ ] API keys and service accounts scoped to the minimum
- [ ] Tokens validated: signature, expiry, issuer, audience

## Input validation

- [ ] All external input validated at the boundary against an allowlisted schema (shape, lengths, ranges, enums, formats); downstream code uses only the parsed value
- [ ] Queries and commands parameterized; nothing built from input strings
- [ ] Output encoded through the framework; raw HTML only after an allowlist sanitizer
- [ ] Redirect targets validated (no open redirects)
- [ ] Uploads: allowlisted types, size caps, content verified by magic bytes when it matters (the extension proves nothing)

## Defaults and footguns

- [ ] **Fail-closed when config is missing**: judge the value used when a setting is absent, not the setting's name. A missing secret, key, or flag stops startup or the request; it never falls back to a literal and carries on
- [ ] No insecure literal as a default (a sample secret, `admin`/`admin`, `verify=False`, `*` origins); "config not found" is no excuse for one
- [ ] Probe every security-relevant parameter with `0`, `""`, `null`, and `-1`: none of them should switch a check off or mean "unlimited"
- [ ] No boolean that turns security off by default, and no security values of the same type that can be swapped silently (key and nonce, user ID and tenant ID)
- [ ] Verification never succeeds silently when it has nothing to verify with (no key, empty signature, empty allowlist)
- [ ] The API is safe for the lazy developer who copies the example and the confused one who misreads a name; "it's documented" is not a mitigation

## Outbound fetches (SSRF)

- [ ] Any URL the user can influence (webhooks, import-from-URL, previews, image proxies) allowlisted by scheme and host
- [ ] All DNS records resolved and private or reserved addresses rejected (loopback, link-local such as `169.254.169.254`, private, unique-local; IPv4 and IPv6)
- [ ] Redirects forbidden; for high-risk surfaces, the resolved IP pinned or a filtering proxy used (DNS rebinding)

## Destructive operations on derived paths

A delete, move, or overwrite is only as safe as the value naming its target. Before the call, require all three:

- [ ] The resolved target (symlinks resolved first) sits under an **allowlisted root**
- [ ] It is at least one level **below** that root
- [ ] **Ownership evidence** is read before the operation, and the expected owner comes from authenticated state

On refusal, log the rejected target and stop; never fall back to a broader path. Known limits: an ownership marker inside the root is self-attestation unless its integrity is protected, and returning a path leaves a check-then-use race where an untrusted process can swap an ancestor (operate on a no-follow descriptor, or keep the hierarchy immutable).

## Headers and CORS

- [ ] Content-Security-Policy starting from `default-src 'self'` and tightened, not loosened
- [ ] Strict-Transport-Security, `X-Content-Type-Options: nosniff`, frame protection (`X-Frame-Options: DENY` or CSP `frame-ancestors`), a strict Referrer-Policy, a Permissions-Policy
- [ ] CORS restricted to an explicit origin list from configuration; never `*` with credentials

## Rate limiting and availability

- [ ] The API rate-limited generally, and authentication strictly
- [ ] Limits backed by a shared store once more than one instance serves traffic (in-memory counters become `limit × instances`, or never fire on serverless)
- [ ] Input size caps and timeouts on anything that parses or waits
- [ ] Caches protected against stampede: serve stale while one request recomputes, or coalesce concurrent misses behind one in-flight computation

## Caching correctness

- [ ] Every input that changes a response is in the cache key: tenant, user, permissions, locale, feature flags (a key that omits the viewer serves one user's data to another)
- [ ] Nothing cached whose staleness is a correctness or security bug: balances, permissions, inventory at checkout

## Secrets

- [ ] Secrets come from the environment or a secrets manager
- [ ] CI and preview environments use their own credentials; never production secrets
- [ ] A secret that reached a remote is treated as compromised: rotate it first, then purge history

## Data protection and privacy

- [ ] Sensitive fields stripped from responses (password hashes, reset tokens)
- [ ] Sensitive data never logged (passwords, tokens, full card numbers); log fields allowlisted
- [ ] HTTPS for external traffic; encryption at rest where required; backups encrypted
- [ ] Personal data classified as fields are added, collected only for a stated purpose, minimized
- [ ] Every personal-data store has a retention limit and a working deletion path, including backups, caches, search indexes, and analytics copies
- [ ] Data-subject rights supported where required (export, correct, delete); sharing with third parties (analytics, ads, LLM vendors) has consent and a data-processing agreement

## Dependencies and supply chain

- [ ] One authoritative lockfile per project or workspace root, committed; CI installs from it without rewriting it
- [ ] Dependency install scripts blocked before first execution and approved only through the package manager's native policy (never blanket-approved)
- [ ] The stack's audit run before release; critical and high findings triaged by reachability (runtime, build, test, deploy paths); deferrals carry a reason and a review date
- [ ] Forced remediation never applied automatically; each upgrade previewed, changelog read, tested
- [ ] New dependencies reviewed for ownership, maintenance, release age, provenance, transitive graph, and typosquatting (audits only match known advisories)
- [ ] Registry signatures or provenance verified where the manager supports it
- [ ] Risk signals checked beyond advisories: an archived or abandoned upstream, a single publisher on the registry, install scripts, and specific supply-chain checks (dangerous CI workflows, committed binaries) rather than one aggregate score
- [ ] A signal that couldn't be measured is reported as unknown; a scan that measured nothing is never reported clean

## AI and LLM features

- [ ] Model output treated as untrusted input: never into `eval`, SQL, a shell, `innerHTML`, or a file path; parsed, validated against a schema, then encoded
- [ ] Prompt injection assumed: permissions enforced in code, not in the system prompt
- [ ] Secrets, other tenants' data, and the full system prompt kept out of the context window
- [ ] Tool permissions scoped, every tool argument validated, destructive actions confirmed
- [ ] Token, rate, and recursion or loop limits set
- [ ] RAG embeddings partitioned per tenant; documents validated before indexing

**Agents in CI** (a workflow that runs an AI agent):

- [ ] No untrusted text (issue, comment, PR title or body, commit messages, CI logs) reaches the agent's prompt, including indirectly through environment variables or a command the prompt tells it to run
- [ ] No `pull_request_target` (or equivalent privileged trigger) combined with checking out and running the PR's own code
- [ ] Agent output never passed to a shell, `eval`, or another privileged step
- [ ] The agent's tool allowlist is narrow: no unrestricted shell, no "allow everything" mode, no wildcard user allowlist; a narrow allowlist that still permits `$(...)` isn't narrow

## Error handling

- [ ] Users get generic errors (a code and a plain message); stack traces, queries, and internals go to server logs only

## OWASP Top 10 quick reference

| # | Risk | Prevention |
|---|---|---|
| 1 | Broken access control | Authorization on every request, ownership checks |
| 2 | Cryptographic failures | HTTPS, strong hashing, no secrets in code |
| 3 | Injection | Parameterized queries, boundary validation |
| 4 | Insecure design | Threat modeling, abuse cases |
| 5 | Security misconfiguration | Headers, minimal permissions, dependency audits |
| 6 | Vulnerable components | Audits, updates, minimal dependencies |
| 7 | Authentication failures | Rate limiting, strong session management |
| 8 | Data integrity failures | Verified updates and dependencies, signed artifacts |
| 9 | Logging failures | Log security events; never log secrets |
| 10 | SSRF | Allowlisted URLs, restricted outbound requests |

## OWASP Top 10 for LLM applications quick reference

| ID | Risk | Prevention |
|---|---|---|
| LLM01 | Prompt injection | Enforce permissions in code, not the system prompt |
| LLM02 | Sensitive information disclosure | Keep secrets and personal data out of prompts; filter outputs |
| LLM03 | Supply chain | Vet models, datasets, and plugins like dependencies |
| LLM04 | Data and model poisoning | Trusted model sources; vet fine-tuning and RAG data |
| LLM05 | Improper output handling | Treat output as untrusted; validate, parameterize, encode |
| LLM06 | Excessive agency | Scope tool permissions; confirm destructive actions |
| LLM07 | System prompt leakage | Assume the system prompt leaks; put no secrets in it |
| LLM08 | Vector and embedding weaknesses | Partition embeddings per tenant; validate documents before indexing |
| LLM09 | Misinformation | Ground answers with citations; validate critical claims |
| LLM10 | Unbounded consumption | Cap tokens, request rate, and recursion depth |
