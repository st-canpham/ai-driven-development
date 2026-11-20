#!/usr/bin/env bash
# L4 isolation: one task = one worktree, one branch, one port slot, one MySQL schema.
#   bash scripts/new-task.sh <change-id> [base]   e.g. add-room-management
#   base defaults to origin/main; pass another ref to stack on unmerged work.
#
# Runs only inside the Dev Container: worktrees store absolute paths, and the
# host's paths differ from the container's.
set -euo pipefail
start=$(date +%s)

die() { echo "ERROR: $*" >&2; exit 1; }

[ "${IN_DEVCONTAINER:-}" = "true" ] || die "run this inside the Dev Container (pnpm dc:shell)."

id="${1:-}"
base="${2:-origin/main}"
[[ "$id" =~ ^[a-z0-9]+(-[a-z0-9]+)+$ ]] || die "usage: new-task.sh <change-id>, kebab-case with a verb, e.g. add-room-management"

# Always work from the main checkout, even when called from a worktree.
root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
cd "$root"
wt=".worktrees/$id"
[ -e "$wt" ] && die "$wt already exists."

# Branch name from CLAUDE.md naming rules.
verb=${id%%-*}
rest=${id#*-}
case "$verb" in
  add | update) branch="feat/$rest" ;;
  fix) branch="fix/$rest" ;;
  remove | refactor) branch="refactor/$rest" ;;
  *) branch="chore/$id" ;;
esac

# Free port slot 1-9 (the Dev Container publishes these ranges).
used=$(cat .worktrees/*/apps/api/.env 2>/dev/null | sed -n 's/^API_PORT=//p' || true)
slot=""
for n in 1 2 3 4 5 6 7 8 9; do
  grep -qx "$((3100 + n))" <<<"$used" || { slot=$n; break; }
done
[ -n "$slot" ] || die "all 9 port slots are in use; clean finished tasks first."
api_port=$((3100 + slot))
web_port=$((5173 + slot))

for f in .env apps/api/.env apps/web/.env; do
  [ -f "$f" ] || die "$f is missing; create it from its .env.example first."
done
set -a; . ./.env; set +a
schema="${DB_NAME}_${id//-/_}"
schema=${schema:0:64}

# Host-side `git gc` must never prune worktrees whose container paths it cannot see.
git config gc.worktreePruneExpire never

echo "==> Worktree $wt on $branch (from $base)"
git fetch -q origin
if git show-ref -q --verify "refs/heads/$branch"; then
  git worktree add -q "$wt" "$branch"
elif git show-ref -q --verify "refs/remotes/origin/$branch"; then
  git worktree add -q --track -b "$branch" "$wt" "origin/$branch"
else
  git worktree add -q -b "$branch" "$wt" "$base"
fi

echo "==> Env files (slot $slot: API :$api_port, web :$web_port, schema $schema)"
sed "s/^DB_NAME=.*/DB_NAME=$schema/" .env > "$wt/.env"
sed -e "s/^DB_NAME=.*/DB_NAME=$schema/" -e "s/^API_PORT=.*/API_PORT=$api_port/" \
  apps/api/.env > "$wt/apps/api/.env"
grep -vE '^VITE_(WEB|API)_PORT=' apps/web/.env > "$wt/apps/web/.env"
printf 'VITE_WEB_PORT=%s\nVITE_API_PORT=%s\n' "$web_port" "$api_port" >> "$wt/apps/web/.env"

echo "==> MySQL schema $schema"
SCHEMA="$schema" node -e '
  const mysql = require(require.resolve("mysql2/promise", { paths: [process.argv[1]] }));
  (async () => {
    const c = await mysql.createConnection({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
      user: "root", password: process.env.DB_ROOT_PASSWORD,
    });
    await c.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.SCHEMA}\``);
    await c.query(`GRANT ALL ON \`${process.env.SCHEMA}\`.* TO ?@"%"`, [process.env.DB_USER]);
    await c.end();
  })().catch((e) => { console.error(e.message); process.exit(1); });
' "$root/apps/api"

echo "==> Dependencies"
(cd "$wt" && pnpm install --frozen-lockfile --prefer-offline --reporter=silent)

echo "==> Migrations"
(cd "$wt" && pnpm --filter api migration:run >/dev/null)

echo
echo "Ready in $(( $(date +%s) - start ))s: $wt"
echo "  branch  $branch"
echo "  API     http://localhost:$api_port/api   (cd $wt && pnpm dev:api)"
echo "  web     http://localhost:$web_port       (cd $wt && pnpm dev:web)"
echo "  schema  $schema"
echo "  agent   cd $wt && claude"
echo "Clean up after merge: bash scripts/clean-task.sh $id"
