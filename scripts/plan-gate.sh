#!/usr/bin/env bash
# L5 merge gate (deterministic, no LLM). Required by the ruleset on main.
#   PR=<number> bash scripts/plan-gate.sh [base]   (base defaults to origin/main)
#
# Checks, all reported before failing:
#   1. scripts/check-plan.sh: plan:approved or plan:tier-0 for code changes
#   2. no OpenSpec change left un-archived; archived delta specs reached openspec/specs/
#   3. openspec validate --specs
#   4. plan:tier-0 comes with a "Tier 0: <reason>" line in the PR body
#   5. exactly one status: label, and it is status:done
#   6. the PR body keeps the template's Plan and Deviations headings
# Labels and body are read live from GitHub, never from the event payload.
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
cd "$(git rev-parse --show-toplevel)"
base="${1:-origin/main}"
pr="${PR:?set PR to the pull request number}"

# PLAN_GATE_LABELS (comma-separated) and PLAN_GATE_BODY override GitHub for tests.
if [ -n "${PLAN_GATE_LABELS+x}" ]; then
  labels=$(tr ',' '\n' <<<"$PLAN_GATE_LABELS")
else
  labels=$(gh pr view "$pr" --json labels -q '.labels[].name') || { echo "FAIL could not read PR #$pr labels"; exit 1; }
fi
if [ -n "${PLAN_GATE_BODY+x}" ]; then
  body=$PLAN_GATE_BODY
else
  body=$(gh pr view "$pr" --json body -q '.body') || { echo "FAIL could not read PR #$pr body"; exit 1; }
fi
changed=$(git diff --name-only "$base"...HEAD) || { echo "FAIL git diff against $base"; exit 1; }

failed=0
ok() { echo "OK    $*"; }
bad() { echo "FAIL  $*"; failed=1; }
has() { grep -qx "$1" <<<"$labels"; }
indent() { sed 's/^/        /'; }

# 1. Plan gate
if out=$(CHECK_PLAN_LABELS=$(paste -sd, - <<<"$labels") bash "$here/check-plan.sh" "$base" 2>&1); then
  ok "check-plan"
else
  bad "check-plan"
fi
indent <<<"$out"

# 2. Archive
active=$(grep -E '^openspec/changes/[^/]+/' <<<"$changed" | grep -vE '^openspec/changes/archive/|/\.gitkeep$' | cut -d/ -f3 | sort -u || true)
if [ -n "$active" ]; then
  while read -r id; do bad "change '$id' is not archived: run /opsx:archive in this PR before merge"; done <<<"$active"
else
  ok "no un-archived OpenSpec change"
fi
archived_specs=$(grep -E '^openspec/changes/archive/[^/]+/specs/' <<<"$changed" || true)
if [ -n "$archived_specs" ] && ! grep -qE '^openspec/specs/' <<<"$changed"; then
  bad "an archived change has delta specs but openspec/specs/ did not change (archive by hand?)"
fi

# 3. Specs validate
if find openspec/specs -name spec.md 2>/dev/null | grep -q .; then
  if out=$(pnpm exec openspec validate --specs --strict --no-interactive 2>&1); then ok "openspec validate --specs"; else bad "openspec validate --specs"; indent <<<"$out"; fi
else
  ok "openspec validate --specs (no specs yet)"
fi

# 4. Tier 0 reason
if has plan:tier-0; then
  if grep -qE 'Tier 0: *[^<[:space:]]' <<<"$body"; then ok "plan:tier-0 has a reason"; else bad "plan:tier-0 needs a 'Tier 0: <reason>' line in the PR body"; fi
fi

# 5. Status labels
status=$(grep -E '^status:' <<<"$labels" || true)
count=$(grep -c . <<<"$status" || true)
if [ "$count" -ne 1 ]; then
  bad "exactly one status: label required (found $count: $(paste -sd' ' - <<<"$status"))"
elif [ "$status" != "status:done" ]; then
  bad "merge waits for status:done (now $status)"
else
  ok "status:done"
fi

# 6. PR template
for h in '#### Plan (L3)' '#### Deviations from plan'; do
  if grep -qxF "$h" <<<"$(tr -d '\r' <<<"$body")"; then ok "PR body has '$h'"; else bad "PR body is missing the '$h' heading from the template"; fi
done

echo
[ "$failed" -eq 0 ] && echo "plan-gate: PASS" || echo "plan-gate: FAIL"
exit "$failed"
