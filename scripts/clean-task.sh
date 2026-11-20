#!/usr/bin/env bash
# L4 isolation: remove a task's worktree, its MySQL schema and (when merged) its branch.
#   bash scripts/clean-task.sh <change-id> [--force]
#
# Without --force it refuses a worktree with uncommitted changes and keeps a
# branch that is not merged into origin/main. Runs only inside the Dev Container.
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }

[ "${IN_DEVCONTAINER:-}" = "true" ] || die "run this inside the Dev Container (pnpm dc:shell)."

id="${1:-}"
force="${2:-}"
[ -n "$id" ] || die "usage: clean-task.sh <change-id> [--force]"
[ -z "$force" ] || [ "$force" = "--force" ] || die "unknown option: $force"

root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
cd "$root"
wt=".worktrees/$id"
[ -d "$wt" ] || die "$wt does not exist."

branch=$(git -C "$wt" branch --show-current)
if [ -n "$(git -C "$wt" status --porcelain)" ] && [ -z "$force" ]; then
  die "$wt has uncommitted changes; commit them or pass --force to discard."
fi

set -a; . ./.env; set +a
schema=$(sed -n 's/^DB_NAME=//p' "$wt/apps/api/.env")
# Never drop the main database: only schemas created by new-task.sh qualify.
[[ "$schema" == "${DB_NAME}_"* ]] || die "refusing to drop '$schema': it is not a task schema (${DB_NAME}_*)."

echo "==> Drop MySQL schema $schema"
SCHEMA="$schema" node -e '
  const mysql = require(require.resolve("mysql2/promise", { paths: [process.argv[1]] }));
  (async () => {
    const c = await mysql.createConnection({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
      user: "root", password: process.env.DB_ROOT_PASSWORD,
    });
    await c.query(`DROP DATABASE IF EXISTS \`${process.env.SCHEMA}\``);
    await c.end();
  })().catch((e) => { console.error(e.message); process.exit(1); });
' "$root/apps/api"

# Stop dev servers and other processes still running inside the worktree,
# so nothing keeps serving from (or writing to) a deleted folder.
abs="$root/$wt"
pids=""
for p in /proc/[0-9]*; do
  pid=${p#/proc/}
  [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ] && continue
  cwd=$(readlink "$p/cwd" 2>/dev/null) || continue
  case "$cwd" in "$abs" | "$abs"/*) pids="$pids $pid" ;; esac
done
if [ -n "$pids" ]; then
  echo "==> Stop processes running in $wt:$pids"
  kill $pids 2>/dev/null || true
  sleep 2
  kill -9 $pids 2>/dev/null || true
fi

echo "==> Remove worktree $wt"
git worktree remove ${force:+--force} "$wt"
git worktree prune

if [ -n "$branch" ]; then
  git fetch -q origin
  # Merged = every commit is in origin/main, by SHA (merge commit) or by patch
  # (rebase and merge). A squash merge is not detectable here: use --force.
  if git merge-base --is-ancestor "$branch" origin/main \
    || [ -z "$(git cherry origin/main "$branch" | grep '^+' || true)" ]; then
    git branch -q -d "$branch" && echo "==> Deleted merged branch $branch"
  elif [ -n "$force" ]; then
    git branch -q -D "$branch" && echo "==> Deleted unmerged branch $branch (--force)"
  else
    echo "==> Kept branch $branch: not merged into origin/main (pass --force to delete)"
  fi
fi
echo "Done."
