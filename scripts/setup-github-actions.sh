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

PROJECTS_ROOT="${PROJECTS_ROOT:-/Users/yashnihalani/Documents/Projects}"
GITHUB_OWNER="${GITHUB_OWNER:-mr-devloper005}"
VPS_HOST="${VPS_HOST:-147.93.111.97}"
VPS_USER="${VPS_USER:-root}"
VPS_PORT="${VPS_PORT:-22}"
VPS_ROOT="${VPS_ROOT:-/opt/automation-sites}"
MASTER_PANEL_URL="${MASTER_PANEL_URL:-https://masterpanel.seoparadox.com}"
MASTER_API_URL="${MASTER_API_URL:-https://masterpanel.seoparadox.com}"
SITE_TAGLINE="${SITE_TAGLINE:-Business listing platform}"
SITE_DESCRIPTION="${SITE_DESCRIPTION:-A listing-first business discovery platform for browsing services, businesses, spaces, and location-based opportunities through a cleaner browsing experience.}"
SITE_OG_IMAGE="${SITE_OG_IMAGE:-/og-default.png}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/github_actions_vps}"
TARGET_DIR="${PROJECTS_ROOT}/${DOMAIN}"
WORKFLOW_PATH="${TARGET_DIR}/.github/workflows/deploy.yml"
APP_DIR="${VPS_ROOT}/${DOMAIN}"
SITE_URL="https://${DOMAIN}"
REPO="${GITHUB_OWNER}/${DOMAIN}"

if [[ ! -d "$TARGET_DIR/.git" ]]; then
  echo "Git project not found: $TARGET_DIR"
  exit 1
fi

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "SSH key not found: $SSH_KEY_PATH"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it first."
  exit 1
fi

mkdir -p "$(dirname "$WORKFLOW_PATH")"

SITE_NAME="$SITE_NAME" \
WORKFLOW_PATH="$WORKFLOW_PATH" \
python3 - <<'PY'
from pathlib import Path
import os

site_name = os.environ["SITE_NAME"]
workflow = Path(os.environ["WORKFLOW_PATH"])
workflow.write_text(f'''name: Deploy {site_name} VPS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - name: Deploy via SSH (attempt 1)
        id: deploy_ssh_attempt_1
        uses: appleboy/ssh-action@v1.2.2
        continue-on-error: true
        env:
          APP_ENV_PRODUCTION: ${{{{ secrets.APP_ENV_PRODUCTION }}}}
          REPO_NAME: ${{{{ github.event.repository.name }}}}
        with:
          host: ${{{{ secrets.VPS_HOST }}}}
          username: ${{{{ secrets.VPS_USER }}}}
          key: ${{{{ secrets.VPS_SSH_KEY }}}}
          port: ${{{{ secrets.VPS_PORT }}}}
          timeout: 60s
          command_timeout: 35m
          envs: APP_ENV_PRODUCTION,REPO_NAME
          script: |
            set -euo pipefail
            APP_ROOT="/opt/automation-sites"
            APP_DIR="$APP_ROOT/$REPO_NAME"

            mkdir -p "$APP_ROOT"
            if [ ! -d "$APP_DIR/.git" ]; then
              git clone "https://github.com/mr-devloper005/$REPO_NAME.git" "$APP_DIR"
            fi

            cd "$APP_DIR"

            printf '%s' "$APP_ENV_PRODUCTION" > .env
            chmod 600 .env

            git remote set-url origin "https://github.com/mr-devloper005/$REPO_NAME.git" 2>/dev/null || true
            git fetch origin main
            git checkout main
            git reset --hard origin/main

            docker compose -f docker-compose.vps.yml up -d --build --remove-orphans
            docker compose -f docker-compose.vps.yml ps

      - name: Wait before retry
        if: steps.deploy_ssh_attempt_1.outcome == 'failure'
        run: sleep 15

      - name: Deploy via SSH (attempt 2)
        id: deploy_ssh_attempt_2
        if: steps.deploy_ssh_attempt_1.outcome == 'failure'
        uses: appleboy/ssh-action@v1.2.2
        continue-on-error: true
        env:
          APP_ENV_PRODUCTION: ${{{{ secrets.APP_ENV_PRODUCTION }}}}
          REPO_NAME: ${{{{ github.event.repository.name }}}}
        with:
          host: ${{{{ secrets.VPS_HOST }}}}
          username: ${{{{ secrets.VPS_USER }}}}
          key: ${{{{ secrets.VPS_SSH_KEY }}}}
          port: ${{{{ secrets.VPS_PORT }}}}
          timeout: 60s
          command_timeout: 35m
          envs: APP_ENV_PRODUCTION,REPO_NAME
          script: |
            set -euo pipefail
            APP_ROOT="/opt/automation-sites"
            APP_DIR="$APP_ROOT/$REPO_NAME"

            mkdir -p "$APP_ROOT"
            if [ ! -d "$APP_DIR/.git" ]; then
              git clone "https://github.com/mr-devloper005/$REPO_NAME.git" "$APP_DIR"
            fi

            cd "$APP_DIR"

            printf '%s' "$APP_ENV_PRODUCTION" > .env
            chmod 600 .env

            git remote set-url origin "https://github.com/mr-devloper005/$REPO_NAME.git" 2>/dev/null || true
            git fetch origin main
            git checkout main
            git reset --hard origin/main

            docker compose -f docker-compose.vps.yml up -d --build --remove-orphans
            docker compose -f docker-compose.vps.yml ps

      - name: Wait before final retry
        if: steps.deploy_ssh_attempt_1.outcome == 'failure' && steps.deploy_ssh_attempt_2.outcome == 'failure'
        run: sleep 20

      - name: Deploy via SSH (attempt 3)
        id: deploy_ssh_attempt_3
        if: steps.deploy_ssh_attempt_1.outcome == 'failure' && steps.deploy_ssh_attempt_2.outcome == 'failure'
        uses: appleboy/ssh-action@v1.2.2
        env:
          APP_ENV_PRODUCTION: ${{{{ secrets.APP_ENV_PRODUCTION }}}}
          REPO_NAME: ${{{{ github.event.repository.name }}}}
        with:
          host: ${{{{ secrets.VPS_HOST }}}}
          username: ${{{{ secrets.VPS_USER }}}}
          key: ${{{{ secrets.VPS_SSH_KEY }}}}
          port: ${{{{ secrets.VPS_PORT }}}}
          timeout: 60s
          command_timeout: 35m
          envs: APP_ENV_PRODUCTION,REPO_NAME
          script: |
            set -euo pipefail
            APP_ROOT="/opt/automation-sites"
            APP_DIR="$APP_ROOT/$REPO_NAME"

            mkdir -p "$APP_ROOT"
            if [ ! -d "$APP_DIR/.git" ]; then
              git clone "https://github.com/mr-devloper005/$REPO_NAME.git" "$APP_DIR"
            fi

            cd "$APP_DIR"

            printf '%s' "$APP_ENV_PRODUCTION" > .env
            chmod 600 .env

            git remote set-url origin "https://github.com/mr-devloper005/$REPO_NAME.git" 2>/dev/null || true
            git fetch origin main
            git checkout main
            git reset --hard origin/main

            docker compose -f docker-compose.vps.yml up -d --build --remove-orphans
            docker compose -f docker-compose.vps.yml ps
''')
PY

APP_ENV_PRODUCTION="NEXT_PUBLIC_MASTER_PANEL_URL=${MASTER_PANEL_URL}
NEXT_PUBLIC_MASTER_API_URL=${MASTER_API_URL}
NEXT_PUBLIC_SITE_CODE=${SITE_CODE}
NEXT_PUBLIC_FEED_REVALIDATE_SECONDS=300
NEXT_PUBLIC_SITE_NAME=${SITE_NAME}
NEXT_PUBLIC_SITE_TAGLINE=${SITE_TAGLINE}
NEXT_PUBLIC_SITE_DESCRIPTION=${SITE_DESCRIPTION}
NEXT_PUBLIC_SITE_DOMAIN=${DOMAIN}
NEXT_PUBLIC_SITE_URL=${SITE_URL}
NEXT_PUBLIC_SITE_OG_IMAGE=${SITE_OG_IMAGE}
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY="

cd "$TARGET_DIR"

gh secret set VPS_HOST --repo "$REPO" --body "$VPS_HOST"
gh secret set VPS_USER --repo "$REPO" --body "$VPS_USER"
gh secret set VPS_PORT --repo "$REPO" --body "$VPS_PORT"
gh secret set VPS_APP_DIR --repo "$REPO" --body "$APP_DIR"
gh secret set VPS_SSH_KEY --repo "$REPO" < "$SSH_KEY_PATH"
printf '%s' "$APP_ENV_PRODUCTION" | gh secret set APP_ENV_PRODUCTION --repo "$REPO"

git add .github/workflows/deploy.yml
if git diff --cached --quiet; then
  echo "Workflow already up to date for ${DOMAIN}."
else
  git commit -m "Add deploy workflow"
  git push origin main
fi

echo
echo "GitHub Actions setup completed for ${DOMAIN}."
echo "Repo: ${REPO}"
echo "Workflow: ${WORKFLOW_PATH}"
