#!/usr/bin/env bash
# ─── DCS Ops Center — Production Update ──────────────────────────────────────
#
# Run this from your LOCAL machine to pull the latest images and restart.
# Use this AFTER the initial bootstrap-server.sh has already been run.
#
# Usage:
#   bash scripts/deploy-update.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVER_USER="eadmin"
SERVER_HOST="10.6.104.13"
SERVER="${SERVER_USER}@${SERVER_HOST}"
DEPLOY_PATH="/opt/docker/client-portals/ndma-dcs"

echo ""
echo "==> Deploying latest images to ${SERVER_HOST}..."
# shellcheck disable=SC2087
ssh "${SERVER}" bash -s << ENDSSH
set -e
cd "${DEPLOY_PATH}"

echo "--- Authenticating with GHCR ---"
GHCR_TOKEN=\$(grep '^GHCR_TOKEN=' .env | cut -d= -f2-)
echo "\${GHCR_TOKEN}" | docker login ghcr.io -u kareemschultz --password-stdin

echo "--- Pulling new images ---"
docker compose pull app docs

echo "--- Restarting containers ---"
docker compose up -d --no-build app docs

echo "--- Running any new migrations ---"
docker compose exec -T app sh -c 'cd packages/db && bunx drizzle-kit migrate'

echo "--- Pruning old images ---"
docker image prune -f

echo ""
echo "Update complete! App: http://${SERVER_HOST}:3000"
ENDSSH
