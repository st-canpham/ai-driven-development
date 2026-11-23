# Level metrics log

One row per merged PR. Used to check the level gates from the playbook.

## L3 · Plan-first

Gates: multi-file PRs with an approved plan attached = **100%**; PRs that needed a second design round **< 10%**.
"Second round" = `plan:review` was added again after `plan:approved`.

Generated from GitHub (labels, files, commits of every merged PR); do not edit the rows by hand. Refresh in any PR with `node scripts/metrics.mjs --write`. PRs #1–#3 predate the plan labels and show `none`.

<!-- metrics:l3:start -->
| Date | PR | Change id / Tier 0 | Code files | Plan approved before code? | Second design round? |
|---|---|---|---|---|---|
| 2026-11-18 | #1 chore: L1 basic setup for Room Booking lab | none | 70 | n/a (none) | n/a |
| 2026-11-19 | #2 chore: L2 advanced setup (sandbox, MCP, session hygiene) | none | 3 | n/a (none) | n/a |
| 2026-11-20 | #3 chore: L3 plan-first workflow | none | 0 | n/a (none) | n/a |
| 2026-11-22 | #4 chore: L4 isolation - one worktree per task | Tier 0 | 2 | n/a (Tier 0) | n/a |
| 2026-11-23 | #5 chore: L5a CI gate and merge gate | Tier 0 | 2 | n/a (Tier 0) | n/a |
| 2026-11-23 | #6 chore: L5b agent hooks (access-guard, change-gate, check-edit) | Tier 0 | 0 | n/a (Tier 0) | n/a |
| 2026-11-23 | #7 chore: GitHub access from the Dev Container (fine-grained token) | Tier 0 | 0 | n/a (Tier 0) | n/a |
| 2026-11-23 | #8 test: change-gate git cases independent of the checked-out branch | Tier 0 | 0 | n/a (Tier 0) | n/a |
| 2026-11-23 | #9 chore: L5c pre-commit hook, githooks-guard, destructive-command rules | Tier 0 | 0 | n/a (Tier 0) | n/a |
| 2026-11-23 | #10 chore: L5d local agent workflow (TDD loop, test review, review loop, advisor) | Tier 0 | 0 | n/a (Tier 0) | n/a |

- Plan approved before code, multi-file OpenSpec PRs: 0/0 = n/a (gate 100%)
- Second design round: 0/0 = n/a (gate < 10%)
<!-- metrics:l3:end -->

## L4 · Isolation

Gates: time to set up a workspace for a new task **< 2 minutes** (`task:new` prints it); incidents caused by state shared between tasks **zero**.

| Date | Change id | `task:new` seconds | Shared-state incident? |
|---|---|---|---|
| 2026-11-20 | add-room-management (setup test, cold pnpm cache) | 76 | No |
| 2026-11-20 | fix-booking-timezone (setup test, warm cache) | 35 | No |
