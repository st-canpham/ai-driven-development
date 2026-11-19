# Level metrics log

One row per merged PR. Used to check the level gates from the playbook.

## L3 · Plan-first

Gates: multi-file PRs with an approved plan attached = **100%**; PRs that needed a second design round **< 10%**.
"Second round" = the PR went back from `plan-approved` to `plan-review`.

| Date | PR | Change id / Tier 0 | Code files | Plan approved before code? | Second design round? |
|---|---|---|---|---|---|
