#!/usr/bin/env bash
# Deploy the ihub server stack to the Arsys VPS (WireGuard-only, see
# memories/ihub-arsys-deploy) by pulling the public GitHub repo ON the VPS,
# then rebuilding the server image. No rsync — the VPS tracks the repo
# directly, so only committed files ever land there.
#
# /opt/ihub is a git checkout of wecloudes/ihub. docker-compose.override.yml
# (restart policies) lives only on the VPS — it is gitignored / untracked and
# survives `git reset --hard`, so deploys never clobber it.
#
#   ./scripts/deploy.sh                 # default host `arsys`, branch main
#   IHUB_DEPLOY_BRANCH=foo ./scripts/deploy.sh
set -euo pipefail

HOST="${IHUB_DEPLOY_HOST:-arsys}"
DEST="${IHUB_DEPLOY_DEST:-/opt/ihub}"
REPO="${IHUB_DEPLOY_REPO:-https://github.com/wecloudes/ihub.git}"
BRANCH="${IHUB_DEPLOY_BRANCH:-main}"

ssh "$HOST" "set -euo pipefail
  mkdir -p '$DEST'
  cd '$DEST'
  git config --global --add safe.directory '$DEST' 2>/dev/null || true
  [ -d .git ] || git init -q
  git remote set-url origin '$REPO' 2>/dev/null || git remote add origin '$REPO'
  echo '>> fetching $BRANCH from $REPO'
  git fetch -q --depth 1 origin '$BRANCH'
  git reset -q --hard 'origin/$BRANCH'
  git rev-parse --short HEAD
  echo '>> rebuilding server'
  docker compose up -d --build server
"
echo ">> deployed $BRANCH to $HOST:$DEST"
