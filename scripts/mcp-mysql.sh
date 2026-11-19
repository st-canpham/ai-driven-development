#!/usr/bin/env bash
# Starts the read-only MySQL MCP server (see .mcp.json).
# Credentials come from the gitignored root .env, never from committed files.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

export MYSQL_HOST="${MCP_MYSQL_HOST:-127.0.0.1}"
export MYSQL_PORT="$DB_PORT"
export MYSQL_DB="$DB_NAME"
export MYSQL_USER="$DB_RO_USER"
export MYSQL_PASS="$DB_RO_PASSWORD"
export ALLOW_INSERT_OPERATION=false
export ALLOW_UPDATE_OPERATION=false
export ALLOW_DELETE_OPERATION=false

exec pnpm dlx @benborla29/mcp-server-mysql@2.0.9
