#!/usr/bin/env bash
# L3 plan-first check for the current branch.
#   bash scripts/check-plan.sh [base]   (base defaults to origin/main)
#
# Every changed code file under apps/ (tests and docs excluded) needs either:
#   - an OpenSpec change under openspec/changes/ and the PR label plan:approved
#     (and not plan:review), or
#   - the PR label plan:tier-0 (no behavior or interface change; the author adds it
#     with a reason in the PR, the reviewer removes it if they disagree).
# Interface files (controllers, DTOs, entities, migrations, web routes and
# endpoints) can never be plan:tier-0.
#
# PR labels come from `gh pr view`; CHECK_PLAN_LABELS="a,b" overrides them
# (used by tests and CI).
set -euo pipefail
cd "$(dirname "$0")/.."

base="${1:-origin/main}"
changed=$(git diff --name-only "$base"...HEAD)

code_files=$(grep -E '^apps/' <<<"$changed" \
  | grep -vE '\.(spec|test|e2e-spec)\.tsx?$|^apps/[^/]+/test/|\.md$' || true)
if [ -z "$code_files" ]; then
  echo "OK: no code changed under apps/ (tests and docs only)."
  exit 0
fi

interface_files=$(grep -E '\.controller\.ts$|/dto/|\.entity\.ts$|/database/migrations/|\.routes\.ts$|/config/endpoint\.ts$' <<<"$code_files" || true)
plan_files=$(grep -E '^openspec/changes/' <<<"$changed" | grep -vE '/\.gitkeep$' || true)

echo "Code files changed under apps/: $(grep -c . <<<"$code_files")"
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
echo "FAIL: code changed without an OpenSpec change or the plan:tier-0 label."
[ -n "${no_pr:-}" ] && echo "      No PR for this branch yet: open one and add plan:tier-0 with a reason, or run /opsx:propose."
exit 1
