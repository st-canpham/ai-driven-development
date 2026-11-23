#!/usr/bin/env bash
# L5 CI gate: fail when this branch adds a way to silence a check instead of
# fixing it (lint/type suppressions, skipped or focused tests, coverage ignores).
#   bash scripts/check-suppressions.sh [base]   (base defaults to origin/main)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
base="${1:-origin/main}"

pattern='eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error|istanbul ignore|c8 ignore|v8 ignore|\b(it|test|describe)\.(skip|only)\(|\b(xit|xdescribe|fit|fdescribe)\('

# Capture first: `git diff | grep -q` under pipefail can read as "no match".
diff=$(git diff --unified=0 "$base"...HEAD -- 'apps/**' ':(exclude)**/*.md')
added=$(grep -E '^\+[^+]' <<<"$diff" || true)
hits=$(grep -nE "$pattern" <<<"$added" || true)

if [ -n "$hits" ]; then
  echo "FAIL: new suppressions or skipped/focused tests. Fix the code or the test instead:"
  sed 's/^[0-9]*:+/      /' <<<"$hits"
  exit 1
fi

config=$(git diff --name-only "$base"...HEAD | grep -E '(^|/)(eslint\.config\.[cm]?[jt]s|\.prettierrc|tsconfig[^/]*\.json|vitest\.config\.ts)$' || true)
if [ -n "$config" ]; then
  # Not a failure: lint/type config can change for good reasons, but the
  # reviewer must look at it. CI prints a warning annotation.
  echo "::warning::Lint/type/test config changed; the reviewer must confirm no check was loosened:"
  sed 's/^/      /' <<<"$config"
fi
echo "OK: no new suppressions."
