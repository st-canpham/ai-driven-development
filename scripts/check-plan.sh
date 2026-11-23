#!/usr/bin/env bash
# L3 plan-first check for the current branch.
#   bash scripts/check-plan.sh [base]   (base defaults to origin/main)
#
# Every PR that changes anything declares its plan with a label:
#   - an OpenSpec change under openspec/changes/ -> plan:approved (and not plan:review)
#   - otherwise (code, config, CI, hooks, docs ...) -> plan:tier-0 (no behavior or
#     interface change; the author adds it with a "Tier 0: <reason>" line, the
#     reviewer removes it if they disagree)
# Interface files (controllers, DTOs, entities, migrations, web routes and
# endpoints) always need the OpenSpec change.
#
# PR labels come from `gh pr view`; CHECK_PLAN_LABELS="a,b" overrides them
# (used by tests and CI).
set -euo pipefail
# Repo root from git, not from the script path: CI runs a copy taken from main.
cd "$(git rev-parse --show-toplevel)"

base="${1:-origin/main}"
changed=$(git diff --name-only "$base"...HEAD | grep -vE '/\.gitkeep$' || true)

if [ -z "$changed" ]; then
  echo "OK: nothing changed."
  exit 0
fi

interface_files=$(grep -E '^apps/' <<<"$changed" \
  | grep -E '\.controller\.ts$|/dto/|\.entity\.ts$|/database/migrations/|\.routes\.ts$|/config/endpoint\.ts$' \
  | grep -vE '\.(spec|test|e2e-spec)\.tsx?$' || true)
plan_files=$(grep -E '^openspec/changes/' <<<"$changed" || true)

echo "Files changed: $(grep -c . <<<"$changed")"
[ -n "$interface_files" ] && echo "Interface files:" && sed 's/^/      /' <<<"$interface_files"

if [ -n "${CHECK_PLAN_LABELS+x}" ]; then
  labels=$(tr ',' '\n' <<<"$CHECK_PLAN_LABELS")
elif command -v gh >/dev/null 2>&1 && labels=$(gh pr view --json labels -q '.labels[].name' 2>/dev/null); then
  :
else
  labels=""
  no_pr=1
fi
has() { grep -qx "$1" <<<"$labels"; }

if [ -n "$plan_files" ]; then
  echo "OpenSpec change:"
  sed -E 's#^(openspec/changes/(archive/)?[^/]+)/.*#\1#' <<<"$plan_files" | sort -u | sed 's/^/      /'
  if [ -n "${no_pr:-}" ]; then
    echo "WARN: no PR for this branch yet, plan:approved not checked."
    exit 0
  fi
  if has plan:review || ! has plan:approved; then
    echo "FAIL: the PR needs plan:approved and not plan:review before code is merged."
    exit 1
  fi
  echo "OK: plan approved."
  exit 0
fi

if [ -n "$interface_files" ]; then
  echo "FAIL: interface files changed without an OpenSpec change; plan:tier-0 is not allowed here."
  echo "      Create one with /opsx:propose."
  exit 1
fi

if has plan:tier-0; then
  echo "OK: plan:tier-0 (no behavior or interface change; reason in the PR)."
  exit 0
fi
echo "FAIL: every change needs an OpenSpec change with plan:approved, or plan:tier-0 with a reason."
[ -n "${no_pr:-}" ] && echo "      No PR for this branch yet: open one and add plan:tier-0 with a reason, or run /opsx:propose."
exit 1
