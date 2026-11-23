---
name: review-loop
description: The mandatory finish for any change under apps/ — run the reviewer agent on the whole change, disposition every finding, route fixes to the test-writer or code-writer, and repeat until a pass is clean (at most 3 passes). Use after /tdd-loop, before marking a PR ready, when asked to review changes, or when the review-gate Stop hook blocks the turn.
---

# Review loop

A change is done when a review pass comes back clean, not when the tests go green. The
`review-gate` Stop hook blocks the end of a turn while code under `apps/` has changed
without a recorded clean review.

```
REVIEW (1) → DISPOSITION every finding (2) → FIX (3) → RE-VERIFY (4)
  → clean? mark and done : pass < 3? back to 1 : stop, blocked
```

**Hard cap: 3 passes.** Number them (`Pass 1/3` …). If pass 3 still has an open `fix now`
finding or a red suite, stop: do not start pass 4 and do not mark. Report it as
**blocked**; three passes without converging means a person decides.

## 0. The diff

```bash
git diff --stat origin/main...HEAD -- apps
git status --short apps
```

Write the file list down, and re-read every changed file in full before reviewing.

## 1. Review — `reviewer`, mode `change`

`Agent(subagent_type: "reviewer")` with: `mode: change`, the change id (or "Tier 0: …"),
the file list, one paragraph on what the task was, and what you were actually unsure
about. Hiding your doubts to get a clean review makes the review worthless.

While it runs, do your own pass: walk every scenario of the delta specs and say which test
covers it; check each `CLAUDE.md` Boundary the change touches.

## 2. Disposition table

Every finding gets one row; nothing is silently dropped.

| # | Severity | Finding | Disposition | Route / evidence |
|---|---|---|---|---|
| 1 | major | … | fix now | code-writer |
| 2 | minor | … | no change needed | the input that proves it is fine |
| 3 | nit | … | out of scope | why, and where it is tracked |

`fix now` is the default for blocker and major. `no change needed` needs a proving input
or a quote. A spec or design question goes to `/advise` first.

## 3. Fix

Route by file: test files → `test-writer`, app code → `code-writer`. One agent at a time;
never while a review is running. Commit each fix (`fix: …`, or `test: …`).

## 4. Re-verify

```bash
pnpm test && pnpm --filter api test:e2e && pnpm lint && pnpm typecheck
```

Then the next pass reviews again, from step 1.

## 5. Clean pass

When a pass returns `VERDICT: clean` and the suites are green:

```bash
node .claude/hooks/review-gate.mjs --mark
```

Then put the last disposition table under the PR's **Deviations from plan** (findings
`no change needed` / `out of scope`, with their reason), mark the PR ready and swap
`status:in-progress` for `status:code-review` (Plan-first step 6).

## Final report

```
REVIEW: clean at pass <n>/3 | blocked at pass 3/3
FINDINGS: <count fixed> fixed, <count> no change needed, <count> out of scope
OPEN: <blocked findings, verbatim, or none>
```
