---
type: command
run: [node, "{case}/checks/merge-access.cjs"]
---

NT-4 trap (harden, authorization; the rule is stated once, in README.md): merge refuses a source or target the user doesn't own, including one only shared with them, and a refused merge changes nothing.
