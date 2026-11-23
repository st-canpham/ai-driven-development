# Level backlog

Work agreed in earlier levels but deferred to a later one. Move an item to its PR when the level starts; delete it when merged.

## L5 · Enforcement

### Label integrity — agreed in L3

- Decided (L5): the agent and the owner share one GitHub account, so CI cannot tell who added a label. The L5b `change-gate` hook blocks the agent from adding `plan:approved`, `status:changes-requested`, `status:done` or `status:cancelled`. A bot identity for the agent would let CI verify it; not planned.
- Count PRs that went from `plan:approved` back to `plan:review` and write the L3 "second design round" metric automatically instead of by hand in `.claude/METRICS.md`.

### Status labels — agreed in L3

- Automate the moves the agent does by hand today: `status:in-progress` when the first code commit lands, `status:code-review` when the PR leaves draft, `status:cancelled` when a PR is closed unmerged.

### Other layers from the playbook

- L5b agent hooks in Node (`.mjs`), fail-closed, tested on host and container: access-guard (`.env*`, `gh auth token`, paths outside the repo), change-gate (push to main, `--no-verify`, `core.hooksPath`, `reset --hard`, `git worktree prune`, `gh pr merge`, person-only labels, `npx`; ask for `pnpm add` and high-risk paths), PostToolUse lint + typecheck + related test, block code edits while the PR lacks `plan:approved`.
  - From `lab-ksapp`: `.github/CODEOWNERS` for the control plane (`.github/`, `.claude/`, `scripts/`, `.devcontainer/`, `openspec/schemas/`, `openspec/config.yaml`). `plan-gate` reads CODEOWNERS from the base branch, never the PR head, and shows which control-plane paths the PR touches so the reviewer checks them closely. The same paths are the hooks' high-risk list (ask before edit).
- L5c git hooks: `.githooks/pre-commit` via `core.hooksPath` (no Lefthook), < 30 s: gitleaks, Prettier and ESLint on staged files; fails if gitleaks is missing.
- L5d read-only reviewer: `claude-code-action@v1`, inline comments only, skips drafts; secret `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`) or `ANTHROPIC_API_KEY`, added by the owner. Local `.claude/agents/reviewer.md` with structured findings and a 3-pass cap.
  - From `lab-ksapp`: `plan-gate` also fails while the reviewer agent has inline comments on the PR's head SHA (zero bot comments = clean review). Count only comments on the latest commit.

## L6 · Spec + TDD

- Stryker for `apps/api` (Jest runner) and `apps/web` (Vitest runner): break threshold 70%, incremental in CI.
- Playwright for web e2e flows.
- CI rejects test-file edits in implementation commits.
- Enable the OpenSpec `verify` workflow.

## Unscheduled

- Dev Container: keep the Claude Code login across rebuilds with a container-only volume for `/home/node/.claude` (`CLAUDE_CONFIG_DIR`).
