#!/usr/bin/env bash
# L3 plan-first check for the current branch.
#   bash scripts/check-plan.sh [base]   (base defaults to origin/main)
# Fails when 2+ code files under apps/ changed without an OpenSpec change,
# or when the branch's PR is not labelled plan-approved.
set -euo pipefail
cd "$(dirname "$0")/.."

base="${1:-origin/main}"
changed=$(git diff --name-only "$base"...HEAD)

code_files=$(grep -E '^apps/' <<<"$changed" || true)
code_count=$(grep -c . <<<"$code_files" || true)
plan_files=$(grep -E '^openspec/changes/' <<<"$changed" | grep -vE '/\.gitkeep$' || true)

echo "Code files changed under apps/: $code_count"

if [ "$code_count" -lt 2 ]; then
  echo "OK: Tier 0 size (fewer than 2 code files), no plan required."
  exit 0
fi

if [ -z "$plan_files" ]; then
  echo "FAIL: $code_count code files changed but no OpenSpec change under openspec/changes/."
  echo "      Create one with /opsx:propose, or split the work."
  exit 1
fi
echo "OK: OpenSpec change found:"
cut -d/ -f1-3 <<<"$plan_files" | sort -u | sed 's/^/      /'

# Label check needs the GitHub CLI and an open PR for this branch.
if ! command -v gh >/dev/null 2>&1; then
  echo "SKIP: gh not installed, label not checked."
  exit 0
fi
if ! labels=$(gh pr view --json labels -q '.labels[].name' 2>/dev/null); then
  echo "SKIP: no PR for this branch yet, label not checked."
  exit 0
fi
if grep -qx plan-review <<<"$labels" || ! grep -qx plan-approved <<<"$labels"; then
  echo "FAIL: PR must have plan-approved and not plan-review before code is merged."
  exit 1
fi
echo "OK: PR is labelled plan-approved."
