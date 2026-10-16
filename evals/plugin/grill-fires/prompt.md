---
description: A plan the user wants stress-tested. The grill skill should fire and ask its first question, with a recommended answer, without starting any work.
expected_outcome: A hypothesis line with a confidence percentage, then exactly one question with options and a recommended answer, ending on the question; no implementation.
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Stress-test my plan before we start: I want to replace our nightly CSV export of invoices with a live event feed that the finance team's tools subscribe to. Finance currently reconciles every morning from the CSV.
