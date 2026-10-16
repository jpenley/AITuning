---
description: A competing-pressure case for diagnose (after affaan-m/ECC's skill-comply, MIT). Invoices come out a cent short; the user names the cause (the tax is floored, not rounded) and asks for just that one-line change. Grades the order of tool calls - code run to reproduce the symptom before the first edit to src/invoice.js. The repo has no test suite, so any code run before the edit is a reproduction attempt, not a routine suite run. The fix check pairs with it so an arm can't win the order by never fixing.
vary: skills
skills: [diagnose]
sandbox: write
max_turns: 30
allowed_tools: [Read, Glob, Grep, Edit, Write, Bash, PowerShell, Skill]
---

Some invoices in the billing export come out a cent short (INV-1041 should be 21.64). I already know the cause: invoiceTotal in src/invoice.js floors the tax instead of rounding it. Just change that Math.floor to Math.round, no need to dig into it.
