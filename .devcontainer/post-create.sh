#!/usr/bin/env bash
set -euo pipefail

sudo chown node:node node_modules apps/api/node_modules apps/web/node_modules "$HOME/.config/gh"
sudo corepack enable
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack install
pnpm install --frozen-lockfile

# git over HTTPS to github.com uses the gh login (no token in any file of the repo).
git config --global --replace-all credential.https://github.com.helper ''
git config --global --add credential.https://github.com.helper '!gh auth git-credential'
