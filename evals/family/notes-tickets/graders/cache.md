---
type: command
run: [node, "{case}/checks/cache.cjs"]
---

NT-2 completeness: list() is cached per user, a change drops only the lists it affects, and edits, creates and shares reach every affected user's cached list.
