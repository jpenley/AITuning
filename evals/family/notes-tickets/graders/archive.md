---
type: command
run: [node, "{case}/checks/archive.cjs"]
---

NT-1: archived notes leave list() and search() for the owner and readers, get() still returns them, only the owner may archive. Lists are warm first, so NT-2's cache must drop them.
