---
type: command
run: [node, "{case}/checks/revoked.cjs"]
---

NT-2 trap (harden, caching): after an unshare the former reader's cached list, and GET /notes, no longer show the note; one user's list is never served to another.
