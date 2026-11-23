# Level backlog

Work agreed in earlier levels but deferred to a later one. Move an item to its PR when the level starts; delete it when merged.

## L5 · Enforcement

### Label integrity — agreed in L3

- Decided (L5): the agent and the owner share one GitHub account, so CI cannot tell who added a label. The L5b `change-gate` hook blocks the agent from adding `plan:approved`, `status:changes-requested`, `status:done` or `status:cancelled`. A bot identity for the agent would let CI verify it; not planned.
- Count PRs that went from `plan:approved` back to `plan:review` and write the L3 "second design round" metric automatically instead of by hand in `.claude/METRICS.md`.

### Status labels — agreed in L3

- Automate the moves the agent does by hand today: `status:in-progress` when the first code commit lands, `status:code-review` when the PR leaves draft, `status:cancelled` when a PR is closed unmerged.

### Other layers from the playbook

- L5b agent hooks: done (access-guard, change-gate, check-edit). Still open:
  - `.github/CODEOWNERS` for the control plane (`.github/`, `.claude/`, `scripts/`, `.devcontainer/`, `openspec/schemas/`, `openspec/config.yaml`). `plan-gate` reads CODEOWNERS from the base branch, never the PR head, and lists the control-plane paths a PR touches so the reviewer checks them closely. The hooks already ask before editing these paths.
- L5d local agents: done (test-writer, code-writer, reviewer, advisor; `/tdd-loop`, `/review-loop`, `/advise`; `role-guard`, `review-gate`). Still open:
  - CI reviewer (`anthropics/claude-code-action`, identity `claude[bot]` from the Claude GitHub App, read-only tools, skips drafts). Blocked on the credential: the owner's Claude Code login is a company Team plan, where `claude setup-token` is meant for Pro/Max, so it needs either the company admin's OK, a company API key with a spend limit, or a personal API key. Then `plan-gate` fails while `claude[bot]` has unresolved inline threads on the PR's head SHA.
  - Free CI review that needs no credential: CodeQL and the Dependency Review action (free on public repositories).
  - `plan-gate` checks that the local review ran (a PR comment marking the head SHA as reviewed); today only the `review-gate` Stop hook holds the agent.

## L6 · Spec + TDD

- Stryker for `apps/api` (Jest runner) and `apps/web` (Vitest runner): break threshold 70%, incremental in CI.
- Playwright for web e2e flows.
- CI rejects test-file edits in implementation commits (`/tdd-loop` already commits `test: … (red)` before `feat: …` and checks locally that tests did not change in the green phase).
- Enable the OpenSpec `verify` workflow.

## Unscheduled

- Dev Container: keep the Claude Code login across rebuilds with a container-only volume for `/home/node/.claude` (`CLAUDE_CONFIG_DIR`).
