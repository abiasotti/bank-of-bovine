#!/usr/bin/env bash
# Interactive setup for a fresh deployment: prompts for the values in
# docker-compose.yml's ${VAR} substitutions, writes them to a root .env
# (which docker compose reads automatically), then pulls the published
# GHCR images and brings the stack up.
#
# Safe to re-run (e.g. to redeploy after a new image is published):
# existing values in .env are reused as defaults instead of being
# overwritten, so re-running this doesn't rotate secrets, change your
# Postgres password, or invalidate existing sessions.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

ENV_FILE=".env"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not found in PATH." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose (v2 plugin) is required but not found." >&2
  exit 1
fi

# Load existing .env (if any) so re-running this script offers previously
# chosen values as defaults instead of blanking them out.
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

prompt() {
  # prompt <var_name> <question> <default>
  local var_name="$1" question="$2" default="${3:-}"
  local current="${!var_name:-$default}"
  local answer
  read -r -p "$question [$current]: " answer
  printf -v "$var_name" '%s' "${answer:-$current}"
}

echo "=== Bank of the Bovine Overlord - deployment setup ==="
echo

prompt DOMAIN "Domain (must already point at this box's IP; use 'localhost' for local testing)" "localhost"

echo
echo "Quote provider: 1) mock (fake prices, no API key needed)  2) finnhub (real quotes)"
prompt QUOTE_PROVIDER_CHOICE "Choice" "${QUOTE_PROVIDER:+$([ "$QUOTE_PROVIDER" = finnhub ] && echo 2 || echo 1)}"
if [ "${QUOTE_PROVIDER_CHOICE:-1}" = "2" ]; then
  QUOTE_PROVIDER="finnhub"
  prompt FINNHUB_API_KEY "Finnhub API key (https://finnhub.io/register)" ""
  if [ -z "$FINNHUB_API_KEY" ]; then
    echo "QUOTE_PROVIDER=finnhub requires a FINNHUB_API_KEY." >&2
    exit 1
  fi
else
  QUOTE_PROVIDER="mock"
  FINNHUB_API_KEY="${FINNHUB_API_KEY:-}"
fi

echo
if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  prompt POSTGRES_PASSWORD "Postgres password" "$POSTGRES_PASSWORD"
else
  read -r -p "Postgres password [leave blank to auto-generate]: " POSTGRES_PASSWORD
  if [ -z "$POSTGRES_PASSWORD" ]; then
    POSTGRES_PASSWORD="$(openssl rand -base64 24)"
    echo "Generated a random Postgres password."
  fi
fi

# AUTH_SECRET / INTERNAL_API_SECRET are non-human-facing - generate once,
# then leave alone on every subsequent run so existing sessions and the
# app<->worker shared secret don't break out from under a running deploy.
if [ -z "${AUTH_SECRET:-}" ]; then
  AUTH_SECRET="$(openssl rand -base64 33)"
  echo "Generated AUTH_SECRET."
fi
if [ -z "${INTERNAL_API_SECRET:-}" ]; then
  INTERNAL_API_SECRET="$(openssl rand -base64 33)"
  echo "Generated INTERNAL_API_SECRET."
fi

prompt IMAGE_TAG "Image tag to deploy (ghcr.io/abiasotti/bank-of-bovine-{app,worker}:<tag>)" "${IMAGE_TAG:-latest}"

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
  echo
  echo "Backed up existing $ENV_FILE."
fi

cat > "$ENV_FILE" <<EOF
DOMAIN=$DOMAIN
QUOTE_PROVIDER=$QUOTE_PROVIDER
FINNHUB_API_KEY=$FINNHUB_API_KEY
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
AUTH_SECRET=$AUTH_SECRET
INTERNAL_API_SECRET=$INTERNAL_API_SECRET
IMAGE_TAG=$IMAGE_TAG
EOF
echo "Wrote $ENV_FILE."

echo
read -r -p "Pull images and start the stack now? [Y/n]: " confirm
case "$confirm" in
  "" | y | Y | yes | YES | Yes) ;;
  *)
    echo "Skipping startup. Run 'docker compose up -d' when ready."
    exit 0
    ;;
esac

docker compose pull
docker compose up -d

echo
echo "Stack is starting. Check status with: docker compose ps"
echo "Once healthy, visit: https://$DOMAIN"
