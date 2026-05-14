#!/usr/bin/env bash
# ─── DCS Ops Center — Server Bootstrap (first-time deploy) ───────────────────
#
# Run this from your LOCAL machine. It will:
#   1. Copy docker-compose.prod.yml + .env.prod to the server
#   2. Create the deploy directory (/opt/docker/client-portals/ndma-dcs)
#   3. Log in to GHCR, pull images, start containers
#   4. Run database migrations
#
# Prerequisites on the server:
#   - Docker + Docker Compose plugin installed
#   - User "eadmin" in the "docker" group  (or using sudo)
#
# Usage:
#   cp .env.prod.example .env.prod      # fill in all CHANGE_ME values first
#   bash scripts/bootstrap-server.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVER_USER="eadmin"
SERVER_HOST="10.6.104.13"
SERVER="${SERVER_USER}@${SERVER_HOST}"
DEPLOY_PATH="/opt/docker/client-portals/ndma-dcs"

# ── Preflight ─────────────────────────────────────────────────────────────────
if [ ! -f ".env.prod" ]; then
  echo ""
  echo "ERROR: .env.prod not found."
  echo "  cp .env.prod.example .env.prod"
  echo "  # then fill in all CHANGE_ME values"
  exit 1
fi

if grep -q "CHANGE_ME" .env.prod; then
  echo ""
  echo "ERROR: .env.prod still contains CHANGE_ME placeholders. Fill them in first."
  grep "CHANGE_ME" .env.prod
  exit 1
fi

echo ""
echo "==> Copying config files to ${SERVER}..."
echo "    (you will be prompted for the SSH password)"
scp docker-compose.prod.yml "${SERVER}:~/ndma-dcs-compose.yml"
scp .env.prod "${SERVER}:~/ndma-dcs.env"

echo ""
echo "==> Running server-side setup on ${SERVER_HOST}..."
echo "    (you may be prompted for the SSH password again)"
# shellcheck disable=SC2087
ssh "${SERVER}" bash -s << ENDSSH
set -e

echo ""
echo "--- Creating deploy directory: ${DEPLOY_PATH} ---"
sudo mkdir -p "${DEPLOY_PATH}"
# Allow eadmin to own the directory (no sudo needed for docker compose commands)
sudo chown \${USER}:\${USER} "${DEPLOY_PATH}" 2>/dev/null || true

echo "--- Copying config files ---"
cp ~/ndma-dcs-compose.yml "${DEPLOY_PATH}/docker-compose.yml"
cp ~/ndma-dcs.env "${DEPLOY_PATH}/.env"
chmod 600 "${DEPLOY_PATH}/.env"

echo "--- Logging in to GitHub Container Registry ---"
GHCR_TOKEN=\$(grep '^GHCR_TOKEN=' "${DEPLOY_PATH}/.env" | cut -d= -f2-)
echo "\${GHCR_TOKEN}" | docker login ghcr.io -u kareemschultz --password-stdin

echo ""
echo "--- Pulling Docker images (this may take a few minutes) ---"
cd "${DEPLOY_PATH}"
docker compose pull

echo ""
echo "--- Starting services ---"
docker compose up -d

echo ""
echo "--- Waiting for app container to be healthy (up to 90 seconds) ---"
HEALTHY=0
for i in \$(seq 1 18); do
  STATUS=\$(docker compose ps --format json app 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health','unknown'))" 2>/dev/null || echo "unknown")
  if [ "\${STATUS}" = "healthy" ]; then
    echo "  App container is healthy!"
    HEALTHY=1
    break
  fi
  echo "  Attempt \${i}/18 — status: \${STATUS} — waiting 5s..."
  sleep 5
done

if [ "\${HEALTHY}" -eq 0 ]; then
  echo ""
  echo "WARNING: App did not report healthy within 90 seconds."
  echo "  Check logs with: docker compose -f ${DEPLOY_PATH}/docker-compose.yml logs app"
  echo "  Attempting migrations anyway..."
fi

echo ""
echo "--- Running database migrations ---"
docker compose exec -T app sh -c 'cd packages/db && bunx drizzle-kit migrate'

echo ""
echo "--- Cleaning up temp files ---"
rm -f ~/ndma-dcs-compose.yml ~/ndma-dcs.env

echo ""
echo "==================================================="
echo " Bootstrap complete!"
echo "==================================================="
echo " App:  http://${SERVER_HOST}:3000"
echo " Docs: http://${SERVER_HOST}:4000"
echo ""
echo " Next steps:"
echo "   1. Create the admin user:"
echo "      docker compose -f ${DEPLOY_PATH}/docker-compose.yml exec app \\"
echo "        bun run scripts/create-admin.ts"
echo ""
echo "   2. Set up GitHub Actions secrets for auto-deploy:"
echo "      DEPLOY_HOST  = ${SERVER_HOST}"
echo "      DEPLOY_USER  = ${SERVER_USER}"
echo "      DEPLOY_SSH_KEY = (contents of ~/.ssh/id_ed25519)"
echo "      GHCR_TOKEN   = (same PAT as in .env.prod)"
echo "==================================================="
ENDSSH

echo ""
echo "All done! The server bootstrap completed successfully."
