#!/bin/bash
# Read-only user for the MySQL MCP server (L2: least privilege).
# Runs only when the mysql-data volume is created for the first time.
# The password comes from DB_RO_PASSWORD in the gitignored root .env.
# Covers DB_NAME and per-worktree schemas prefixed with it (L4).
set -euo pipefail

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS '${DB_RO_USER}'@'%' IDENTIFIED BY '${DB_RO_PASSWORD}';
GRANT SELECT, SHOW VIEW ON \`${MYSQL_DATABASE}%\`.* TO '${DB_RO_USER}'@'%';
SQL
