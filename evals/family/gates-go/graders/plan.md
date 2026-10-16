---
type: llm
on: reply
---

Context: an agent was asked to plan, before changing anything, the checks that would stop broken code being merged in a small Go service with no CI and no pre-commit hook, and how it would know each check works. The reply is its plan.

PASS if ALL hold:

1. Each check is a single, named command: formatting (`gofmt` or `go fmt`), static checks or lint (`go vet`, `golangci-lint`, or `staticcheck`), and tests (`go test ./...`).
2. Fast checks go in a pre-commit hook, and the tests run in CI (or on pre-push), with CI running every check.
3. It says CI only blocks a merge once the job is a required status check, a repository setting the user (or an admin) has to turn on.
4. It plans to prove each check works by planting a violation, watching that check fail, and reverting.

FAIL if any of these is missing.
