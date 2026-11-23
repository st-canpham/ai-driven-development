# Level metrics log

One row per merged PR. Used to check the level gates from the playbook.

## L3 · Plan-first

Gates: multi-file PRs with an approved plan attached = **100%**; PRs that needed a second design round **< 10%**.
"Second round" = the PR went back from `plan:approved` to `plan:review`.

| Date | PR | Change id / Tier 0 | Code files | Plan approved before code? | Second design round? |
|---|---|---|---|---|---|
| 2026-11-18 | #1 L1 basic setup | before L3 (no plan gate yet) | 70 | n/a | n/a |
| 2026-11-19 | #2 L2 advanced setup | before L3 (no plan gate yet) | 3 | n/a | n/a |
| 2026-11-20 | #3 L3 plan-first workflow | before `plan:tier-0` existed; docs and tooling | 0 | n/a | n/a |
| 2026-11-22 | #4 L4 isolation | Tier 0: tooling and Dev Container | 2 (config) | n/a (Tier 0) | No |
| 2026-11-23 | #5 L5a CI and merge gate | Tier 0: CI and gate scripts | 2 (config) | n/a (Tier 0) | No |
| 2026-11-23 | #7 GitHub access from the Dev Container | Tier 0: Dev Container config and docs | 0 | n/a (Tier 0) | No |
| 2026-11-23 | #6 L5b agent hooks | Tier 0: hooks, CI step, gate scripts | 0 | n/a (Tier 0) | No |

## L4 · Isolation

Gates: time to set up a workspace for a new task **< 2 minutes** (`task:new` prints it); incidents caused by state shared between tasks **zero**.

| Date | Change id | `task:new` seconds | Shared-state incident? |
|---|---|---|---|
| 2026-11-20 | add-room-management (setup test, cold pnpm cache) | 76 | No |
| 2026-11-20 | fix-booking-timezone (setup test, warm cache) | 35 | No |
