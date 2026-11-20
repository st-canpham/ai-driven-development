# Level backlog

Work agreed in earlier levels but deferred to a later one. Move an item to its PR when the level starts; delete it when merged.

## L5 · Enforcement

### Plan gate (CI) — agreed in L3

- `.github/workflows/plan-gate.yml` on every PR, job `plan-gate`:
  - Run `bash scripts/check-plan.sh origin/main` with `CHECK_PLAN_LABELS` from the PR labels.
  - Fail while the PR contains `openspec/changes/<id>/` outside `archive/`: "Change `<id>` is not archived. Run `/opsx:archive` in this PR before merge."
  - Pass when only `openspec/changes/archive/<date>-<id>/` is present, or no change (Tier 0, docs).
  - Also run `pnpm exec openspec validate --specs`, and check that `openspec/specs/` changed when an archived change has delta specs (stops a hand-moved folder from passing).
- Ruleset on `main`: changes only through PRs; `plan-gate` is a required status check; **empty bypass list** so admins cannot merge past it.
- Known limit: an admin can still edit or disable the ruleset. The gate protects against forgetting, not against intent.

### Label integrity — agreed in L3

- CI reads the PR timeline and accepts `plan:approved` only when a person (not the agent's token or a bot) added it.
- `plan:tier-0` may come from the agent: CI checks that the PR body has a "Tier 0: <reason>" line, and keeps failing on interface files.
- Count PRs that went from `plan:approved` back to `plan:review` and write the L3 "second design round" metric automatically instead of by hand in `.claude/METRICS.md`.
- The same person-only check for `status:changes-requested`, `status:done` and `status:cancelled`.

### Status labels — agreed in L3

- Fail the plan gate when a PR has zero or more than one `status:` label, and block merge unless it is `status:done`.
- Automate the moves the agent does by hand today: `status:in-progress` when the first code commit lands, `status:code-review` when the PR leaves draft, `status:cancelled` when a PR is closed unmerged.

### Other layers from the playbook

- Agent hooks (`.claude/settings.json`): block destructive commands, reading `.env`, migrations against non-local DBs, and edits outside `openspec/` while the PR lacks `plan:approved`.
- Git hooks (Lefthook, < 30 s): Prettier, ESLint, `tsc`, gitleaks on staged files.
- CI: lint, typecheck, unit and e2e tests (MySQL service), coverage threshold, gitleaks; fail on new `eslint-disable` / `@ts-ignore` or loosened lint config.
- Read-only reviewer agent on every PR (needs `ANTHROPIC_API_KEY` in repo secrets — owner adds it).

## L6 · Spec + TDD

- Stryker for `apps/api` (Jest runner) and `apps/web` (Vitest runner): break threshold 70%, incremental in CI.
- Playwright for web e2e flows.
- CI rejects test-file edits in implementation commits.
- Enable the OpenSpec `verify` workflow.

## Unscheduled

- Dev Container: keep the Claude Code login across rebuilds with a container-only volume for `/home/node/.claude` (`CLAUDE_CONFIG_DIR`).
