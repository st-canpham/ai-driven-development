#!/usr/bin/env bash
set -euo pipefail

sudo chown node:node node_modules apps/api/node_modules apps/web/node_modules
sudo corepack enable
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack install
pnpm install --frozen-lockfile

# Local dev env files; never overwrite an existing one.
cp -n .env.example apps/api/.env || true
cp -n apps/web/.env.example apps/web/.env || true
