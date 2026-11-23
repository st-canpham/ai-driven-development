# Level backlog

Work agreed in earlier levels but deferred to a later one. Move an item to its PR when the level starts; delete it when merged.

## L5 · Enforcement

L5 is done except for one item that waits on the owner:

- **CI reviewer** (`anthropics/claude-code-action`, identity `claude[bot]` from the Claude GitHub App, read-only tools, skips drafts). Blocked on the credential: the owner's Claude Code login is a company Team plan, where `claude setup-token` is meant for Pro/Max, so it needs either the company admin's OK, a company API key with a spend limit, or a personal API key. Then `plan-gate` also fails while `claude[bot]` has unresolved inline threads on the PR's head SHA.
- Decided (L5): the agent and the owner share one GitHub account, so CI cannot tell who added a label or posted the review marker. `change-gate` blocks the agent from adding person-only labels; the `status-labels` workflow adds `status:cancelled` as `github-actions`. A bot identity for the agent would let CI verify both; not planned.
- Owner, in the ruleset on `main`: consider making `codeql` and `dependency-review` (workflow `security`) required checks once they have run green on a few PRs.

## L6 · Spec + TDD

- Stryker for `apps/api` (Jest runner) and `apps/web` (Vitest runner): break threshold 70%, incremental in CI.
- Playwright for web e2e flows.
- CI rejects test-file edits in implementation commits (`/tdd-loop` already commits `test: … (red)` before `feat: …` and checks locally that tests did not change in the green phase).
- Enable the OpenSpec `verify` workflow.

## Unscheduled

- Dev Container: keep the Claude Code login across rebuilds with a container-only volume for `/home/node/.claude` (`CLAUDE_CONFIG_DIR`).
