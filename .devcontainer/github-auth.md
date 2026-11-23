# GitHub access in the Dev Container (one-time setup)

The agent in the Dev Container pushes its task branch and opens the draft PR
itself (Plan-first, L3). It does that with **one fine-grained personal access
token** that only you create and enter, once per machine. Your host's GitHub
login is never mounted into the container.

| | |
|---|---|
| Token type | Fine-grained PAT, **one repository only** |
| Lives at | `~/.config/gh` in the container, on the `github-auth` Docker volume |
| Used by | `gh` (PRs, labels, CI runs) and `git push` over HTTPS (`gh auth git-credential`) |
| Survives | container rebuilds; removed only with the volume |
| Agent access | the agent can **use** `gh`, but the `access-guard` hook denies reading `~/.config/gh` and `gh auth token` |

## 1. Create the token (GitHub, in your browser)

GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**

| Field | Value |
|---|---|
| Token name | `ai-driven-development-agent` |
| Expiration | 90 days or less |
| Resource owner | the repository owner |
| Repository access | **Only select repositories** → this repository |

Repository permissions (everything else stays **No access**):

| Permission | Access | Why |
|---|---|---|
| Metadata | Read | required |
| Contents | Read and write | push task branches |
| Pull requests | Read and write | open draft PRs, edit the body, PR labels |
| Issues | Read and write | labels go through the Issues API |
| Actions | Read | read CI runs and logs |
| Commit statuses | Read | read check states |

Never grant Administration, Secrets, Variables, Workflows or Environments: the
token then cannot change rulesets, secrets or workflow files.

## 2. Log in inside the container

```bash
pnpm dc:shell
```

In the container shell:

```bash
gh auth login --hostname github.com --git-protocol https
```

Choose **Paste an authentication token** and paste it. Never paste the token
into a chat with the agent.

Then set the identity for commits made in the container (stored on the same
volume, not in the repo):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 3. Check

```bash
gh auth status
gh pr list --limit 1
gh run list --limit 1
git ls-remote origin HEAD
```

All four must succeed.

## What still protects `main`

| Risk | Stopped by |
|---|---|
| push or merge to `main` | ruleset on `main` (no bypass) and the `change-gate` hook |
| agent adds `plan:approved` / `status:done` | `change-gate` hook |
| changing workflows, secrets, rulesets | the token has no such permission |
| leaked token | one repository only, expires, revocable on GitHub |

## Known limits

- Fine-grained PATs cannot read **Checks**, so `gh pr checks` fails with 403.
  Read CI with `gh run list` and `gh run view <id> --log-failed`.
- The token expires: when `gh` reports `401`, create a new one and repeat step 2.

## Revoke or reset

- Revoke on GitHub: Settings → Developer settings → Fine-grained tokens → the token → **Revoke**.
- Remove it from this machine (stop the Dev Container first):

  ```bash
  docker volume rm ai-driven-development_github-auth
  ```
