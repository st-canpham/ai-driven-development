# Level metrics log

One row per merged PR. Used to check the level gates from the playbook.

## L3 · Plan-first

Gates: multi-file PRs with an approved plan attached = **100%**; PRs that needed a second design round **< 10%**.
"Second round" = the PR went back from `plan:approved` to `plan:review`.

| Date | PR | Change id / Tier 0 | Code files | Plan approved before code? | Second design round? |
|---|---|---|---|---|---|

## L4 · Isolation

Gates: time to set up a workspace for a new task **< 2 minutes** (`task:new` prints it); incidents caused by state shared between tasks **zero**.

| Date | Change id | `task:new` seconds | Shared-state incident? |
|---|---|---|---|
| 2026-11-20 | add-room-management (setup test, cold pnpm cache) | 76 | No |
| 2026-11-20 | fix-booking-timezone (setup test, warm cache) | 35 | No |
