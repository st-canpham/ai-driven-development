---
name: advise
description: Get a cited verdict on one blocking spec or design question from the advisor agent — code or a test disagrees with the approved OpenSpec change, a test is DISPUTED, a spec is silent or contradicts itself, design.md and the spec collide, or a change seems to need a CLAUDE.md boundary broken. Use before choosing a side, before guessing, and before reporting "blocked". Not for hooks, permissions, git, CI or Docker problems.
---

# Advise

Use it when you are blocked on *which source governs*, not on tooling.

## 1. Frame the question

One line naming the decision, e.g. "Must POST /api/bookings return 409 or 422 when the
slot overlaps an existing booking?" Several questions: take the one that blocks now.

## 2. Pass the context

Do not make the advisor rediscover it:

- the change id, the task id and the scenario
- the files involved, with the line you are unsure about
- the test and its failure output, or the reviewer finding, verbatim
- what you were about to do

## 3. Call the advisor

`Agent(subagent_type: "advisor", run_in_background: false)` with the question and the
context. Foreground: your next step depends on it.

## 4. Act on the verdict

| NEXT ACTION | You do |
|---|---|
| implement / fix code | Route to the `code-writer` with the quote |
| fix test | Route to the `test-writer` with the quote |
| update plan | Stop the task. `/opsx:update`, swap `plan:approved` back to `plan:review`, put the decision request in a PR comment, wait for a person |
| stop | Stop. Report the boundary; never work around it |
| out of scope | Follow the pointer; it was not a spec question |

Do not argue with a verdict by guessing. If you think it missed a source, run `/advise`
again naming that source. A second contested answer goes to a person.
