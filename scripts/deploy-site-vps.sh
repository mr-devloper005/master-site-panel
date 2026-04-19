#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <domain> <site_code> <site_name> <port>"
  exit 1
fi

DOMAIN="$1"
SITE_CODE="$2"
SITE_NAME="$3"
PORT="$4"

VPS_HOST="${VPS_HOST:-147.93.111.97}"
VPS_USER="${VPS_USER:-root}"
VPS_ROOT="${VPS_ROOT:-/opt/automation-sites}"
GITHUB_OWNER="${GITHUB_OWNER:-mr-devloper005}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/github_actions_vps}"
MASTER_PANEL_URL="${MASTER_PANEL_URL:-https://masterpanel.seoparadox.com}"
MASTER_API_URL="${MASTER_API_URL:-https://masterpanel.seoparadox.com}"
SITE_TAGLINE="${SITE_TAGLINE:-Business listing platform}"
SITE_DESCRIPTION="${SITE_DESCRIPTION:-A listing-first business discovery platform for browsing services, businesses, spaces, and location-based opportunities through a cleaner browsing experience.}"
SITE_OG_IMAGE="${SITE_OG_IMAGE:-/og-default.png}"
SITE_URL="https://${DOMAIN}"
APP_DIR="${VPS_ROOT}/${DOMAIN}"
CONTAINER_NAME="${SITE_CODE}_app"

SSH_ARGS=()
if [[ -f "$SSH_KEY_PATH" ]]; then
  SSH_ARGS+=(-i "$SSH_KEY_PATH" -o IdentitiesOnly=yes)
fi

ssh "${SSH_ARGS[@]}" "${VPS_USER}@${VPS_HOST}" bash <<EOF_REMOTE
set -euo pipefail
mkdir -p "${VPS_ROOT}"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone "https://github.com/${GITHUB_OWNER}/${DOMAIN}.git" "${APP_DIR}"
fi
cd "${APP_DIR}"
git remote set-url origin "https://github.com/${GITHUB_OWNER}/${DOMAIN}.git" || true
git fetch origin main
git checkout main
git reset --hard origin/main
cat > .env <<ENVEOF
NEXT_PUBLIC_MASTER_PANEL_URL=${MASTER_PANEL_URL}
NEXT_PUBLIC_MASTER_API_URL=${MASTER_API_URL}
NEXT_PUBLIC_SITE_CODE=${SITE_CODE}
NEXT_PUBLIC_FEED_REVALIDATE_SECONDS=300
NEXT_PUBLIC_SITE_NAME=${SITE_NAME}
NEXT_PUBLIC_SITE_TAGLINE=${SITE_TAGLINE}
NEXT_PUBLIC_SITE_DESCRIPTION=${SITE_DESCRIPTION}
NEXT_PUBLIC_SITE_DOMAIN=${DOMAIN}
NEXT_PUBLIC_SITE_URL=${SITE_URL}
NEXT_PUBLIC_SITE_OG_IMAGE=${SITE_OG_IMAGE}
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY=
ENVEOF
chmod 600 .env

docker compose -f docker-compose.vps.yml down --remove-orphans || true

for stale in \$(docker ps -aq --filter "name=${CONTAINER_NAME}" --filter "name=_${CONTAINER_NAME}"); do
  docker rm -f "\${stale}" || true
done

docker compose -f docker-compose.vps.yml up -d --build --remove-orphans

docker ps --filter "name=${CONTAINER_NAME}"
curl --max-time 10 -I "http://127.0.0.1:${PORT}" || true
EOF_REMOTE

echo
echo "VPS deploy completed for ${DOMAIN}."
echo "Next: add nginx config and run certbot if DNS is ready."
