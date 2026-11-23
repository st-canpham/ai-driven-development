#!/usr/bin/env bash
set -euo pipefail

sudo chown node:node node_modules apps/api/node_modules apps/web/node_modules "$HOME/.config/gh"
# gitleaks for the pre-commit hook (.githooks/pre-commit, L5c): a pinned release,
# checked against its published sha256 before it is installed.
GITLEAKS_VERSION=8.30.1
case "$(dpkg --print-architecture)" in
  amd64) gl_arch=x64 gl_sha=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb ;;
  arm64) gl_arch=arm64 gl_sha=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080 ;;
  *) echo "post-create: no pinned gitleaks for $(dpkg --print-architecture)" >&2; exit 1 ;;
esac
if ! gitleaks version 2>/dev/null | grep -q "$GITLEAKS_VERSION"; then
  gl_tmp=$(mktemp -d)
  curl -fsSL -o "$gl_tmp/gitleaks.tar.gz" \
    "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${gl_arch}.tar.gz"
  echo "$gl_sha  $gl_tmp/gitleaks.tar.gz" | sha256sum -c --quiet -
  tar -xzf "$gl_tmp/gitleaks.tar.gz" -C "$gl_tmp" gitleaks
  sudo install -m 0755 "$gl_tmp/gitleaks" /usr/local/bin/gitleaks
  rm -rf "$gl_tmp"
fi

sudo corepack enable
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack install
pnpm install --frozen-lockfile

# git over HTTPS to github.com uses the gh login (no token in any file of the repo).
git config --global --replace-all credential.https://github.com.helper ''
git config --global --add credential.https://github.com.helper '!gh auth git-credential'
