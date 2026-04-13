#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <domain> <site_code> <site_name> <port> [public|private]"
  exit 1
fi

DOMAIN="$1"
SITE_CODE="$2"
SITE_NAME="$3"
PORT="$4"
VISIBILITY="${5:-public}"

BASE_TEMPLATE_DIR="${BASE_TEMPLATE_DIR:-/Users/yashnihalani/Documents/Projects/site-base-template}"
PROJECTS_ROOT="${PROJECTS_ROOT:-/Users/yashnihalani/Documents/Projects}"
GITHUB_OWNER="${GITHUB_OWNER:-mr-devloper005}"
MASTER_PANEL_URL="${MASTER_PANEL_URL:-https://masterpanel.seoparadox.com}"
MASTER_API_URL="${MASTER_API_URL:-https://masterpanel.seoparadox.com}"
SITE_TAGLINE="${SITE_TAGLINE:-Business listing platform}"
SITE_DESCRIPTION="${SITE_DESCRIPTION:-A listing-first business discovery platform for browsing services, businesses, spaces, and location-based opportunities through a cleaner browsing experience.}"
SITE_OG_IMAGE="${SITE_OG_IMAGE:-/og-default.png}"
SITE_URL="https://${DOMAIN}"
TARGET_DIR="${PROJECTS_ROOT}/${DOMAIN}"
SERVICE_NAME="${SITE_CODE}"
CONTAINER_NAME="${SITE_CODE}_app"

if [[ ! -d "$BASE_TEMPLATE_DIR" ]]; then
  echo "Base template not found: $BASE_TEMPLATE_DIR"
  exit 1
fi

if [[ -e "$TARGET_DIR" ]]; then
  if [[ -d "$TARGET_DIR/.git" ]]; then
    echo "Target already bootstrapped, skipping: $TARGET_DIR"
    exit 0
  fi

  if [[ -d "$TARGET_DIR" ]]; then
    shopt -s nullglob dotglob
    existing_items=("$TARGET_DIR"/*)
    shopt -u nullglob dotglob

    only_stub_dir=true
    for item in "${existing_items[@]}"; do
      base_name="$(basename "$item")"
      if [[ "$base_name" != ".next" ]]; then
        only_stub_dir=false
        break
      fi
    done

    if [[ "$only_stub_dir" == true ]]; then
      rm -rf "$TARGET_DIR"
    else
      echo "Target directory already exists with files: $TARGET_DIR"
      exit 1
    fi
  else
    echo "Target path already exists and is not a directory: $TARGET_DIR"
    exit 1
  fi
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it first."
  exit 1
fi

if [[ "$VISIBILITY" != "public" && "$VISIBILITY" != "private" ]]; then
  echo "Visibility must be 'public' or 'private'."
  exit 1
fi

cp -R "$BASE_TEMPLATE_DIR" "$TARGET_DIR"
cd "$TARGET_DIR"

rm -rf .git node_modules .next

git init

DOMAIN="$DOMAIN" \
SITE_CODE="$SITE_CODE" \
SITE_NAME="$SITE_NAME" \
SITE_TAGLINE="$SITE_TAGLINE" \
SITE_DESCRIPTION="$SITE_DESCRIPTION" \
SITE_URL="$SITE_URL" \
SITE_OG_IMAGE="$SITE_OG_IMAGE" \
SERVICE_NAME="$SERVICE_NAME" \
CONTAINER_NAME="$CONTAINER_NAME" \
PORT="$PORT" \
MASTER_PANEL_URL="$MASTER_PANEL_URL" \
MASTER_API_URL="$MASTER_API_URL" \
python3 - <<'PY'
from pathlib import Path
import os
import re

domain = os.environ["DOMAIN"]
site_code = os.environ["SITE_CODE"]
site_name = os.environ["SITE_NAME"]
site_tagline = os.environ["SITE_TAGLINE"]
site_description = os.environ["SITE_DESCRIPTION"]
site_url = os.environ["SITE_URL"]
site_og_image = os.environ["SITE_OG_IMAGE"]
service_name = os.environ["SERVICE_NAME"]
container_name = os.environ["CONTAINER_NAME"]
port = os.environ["PORT"]
master_panel_url = os.environ["MASTER_PANEL_URL"]
master_api_url = os.environ["MASTER_API_URL"]

identity_path = Path('src/config/site.identity.ts')
env_example_path = Path('.env.example')
compose_path = Path('docker-compose.vps.yml')
workflow_path = Path('.github/workflows/deploy.yml')

identity = identity_path.read_text()
identity = re.sub(r"code: process\.env\.NEXT_PUBLIC_SITE_CODE \|\| '.*?'", f"code: process.env.NEXT_PUBLIC_SITE_CODE || '{site_code}'", identity)
identity = re.sub(r"name: process\.env\.NEXT_PUBLIC_SITE_NAME \|\| '.*?'", f"name: process.env.NEXT_PUBLIC_SITE_NAME || '{site_name}'", identity)
identity = re.sub(r"tagline: process\.env\.NEXT_PUBLIC_SITE_TAGLINE \|\| '.*?'", f"tagline: process.env.NEXT_PUBLIC_SITE_TAGLINE || '{site_tagline}'", identity)
identity = re.sub(r"process\.env\.NEXT_PUBLIC_SITE_DESCRIPTION \|\|\n\s+'.*?'", f"process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||\n    '{site_description}'", identity, flags=re.S)
identity = re.sub(r"domain: process\.env\.NEXT_PUBLIC_SITE_DOMAIN \|\| '.*?'", f"domain: process.env.NEXT_PUBLIC_SITE_DOMAIN || '{domain}'", identity)
identity = re.sub(r"url: process\.env\.NEXT_PUBLIC_SITE_URL \|\| '.*?'", f"url: process.env.NEXT_PUBLIC_SITE_URL || '{site_url}'", identity)
identity = re.sub(r"ogImage: process\.env\.NEXT_PUBLIC_SITE_OG_IMAGE \|\| '.*?'", f"ogImage: process.env.NEXT_PUBLIC_SITE_OG_IMAGE || '{site_og_image}'", identity)
identity_path.write_text(identity)

env_example = f"""NEXT_PUBLIC_MASTER_PANEL_URL={master_panel_url}
NEXT_PUBLIC_MASTER_API_URL={master_api_url}
NEXT_PUBLIC_SITE_CODE={site_code}
NEXT_PUBLIC_FEED_REVALIDATE_SECONDS=300

NEXT_PUBLIC_SITE_NAME={site_name}
NEXT_PUBLIC_SITE_TAGLINE={site_tagline}
NEXT_PUBLIC_SITE_DESCRIPTION={site_description}
NEXT_PUBLIC_SITE_DOMAIN={domain}
NEXT_PUBLIC_SITE_URL={site_url}
NEXT_PUBLIC_SITE_OG_IMAGE={site_og_image}
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY=
"""
env_example_path.write_text(env_example)

compose = compose_path.read_text()
compose = re.sub(r"services:\n\s+[A-Za-z0-9_-]+:", f"services:\n  {service_name}:", compose, count=1)
compose = re.sub(r"container_name:\s*[A-Za-z0-9_-]+", f"container_name: {container_name}", compose, count=1)
compose = re.sub(r'127\.0\.0\.1:\d+:3000', f'127.0.0.1:{port}:3000', compose, count=1)
if "network_mode: bridge" not in compose:
    compose = re.sub(r"(env_file:\n\s+- \.env\n)", r"\1    network_mode: bridge\n", compose, count=1)
compose_path.write_text(compose)

if workflow_path.exists():
    workflow = workflow_path.read_text()
    workflow = re.sub(r"name:\s*Deploy .*? VPS", f"name: Deploy {site_name} VPS", workflow, count=1)
    workflow_path.write_text(workflow)
PY

if [[ ! -f .gitignore ]]; then
  cat > .gitignore <<'GITEOF'
node_modules
.next
.env
GITEOF
fi

git add .
git commit -m "Initial ${SITE_NAME} site setup"
git branch -M main

if gh repo view "${GITHUB_OWNER}/${DOMAIN}" >/dev/null 2>&1; then
  echo "GitHub repo already exists: ${GITHUB_OWNER}/${DOMAIN}"
else
  gh repo create "$DOMAIN" --"$VISIBILITY"
fi
git remote add origin "git@github.com:${GITHUB_OWNER}/${DOMAIN}.git"
git push -u origin main
git checkout -b dev
git push -u origin dev

echo
echo "Site bootstrap completed."
echo "Project: $TARGET_DIR"
echo "Repo: git@github.com:${GITHUB_OWNER}/${DOMAIN}.git"
echo "Main branch pushed. Dev branch pushed."
echo "Next: run the VPS deploy script for $DOMAIN on port $PORT"
