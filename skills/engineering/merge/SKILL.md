---
name: merge
description: Use when a git merge or rebase has stopped on conflicts, or when merging branches whose changes overlap.
---

# Merge

Resolve an in-progress merge or rebase by **intent**: understand why each side made its change, then keep both intents wherever possible.

1. **See the current state**: the operation in progress, the conflicting files, and the history of both sides (`git status`, `git log --merge`, `git diff`).
2. **Find the primary sources** for each conflict: the commit messages, the PRs, and the tickets or spec behind each side's change. Know what each side was trying to achieve before touching the hunk.
3. **Resolve each hunk.**
   - Where both intents can stand, keep both.
   - Where they can't, keep the one that matches the merge's stated goal, and record the trade-off as a ruling in the merge commit body: `Ruling: <what was kept> — <why> — <what it costs if wrong>`.
   - Resolve with the behaviour each side already had. If a hunk can only be resolved by inventing new behaviour, or both intents conflict and neither matches the merge's goal, stop and ask the user with both sides laid out.
4. **Run the project's automated checks**: typecheck, then tests, then formatting. Fix anything the merge broke.
5. **Finish the operation**: stage and commit the merge, or continue the rebase until every commit is applied, repeating steps 1-4 for each conflicting commit.

Report the outcome with evidence (the `evidence` skill): which files conflicted, each ruling made, and the check results on the finished merge.
