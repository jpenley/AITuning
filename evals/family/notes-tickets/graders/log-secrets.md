---
type: command
run: [node, "{case}/checks/log-secrets.cjs"]
---

NT-3 trap (harden, logging): headers are logged but neither a valid nor a rejected bearer token is. Fails when nothing is logged.
