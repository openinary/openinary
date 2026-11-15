#!/usr/bin/env bash
# Cloud preprod: the current checkout deployed on a copy of prod data.
#
#   https://preprod-app.openinary.dev   dashboard  (Worker openinary-web-preprod)
#   https://preprod-cdn.openinary.dev   API + CDN  (Worker openinary-server-preprod)
#
# Usage (from the repo root, Docker running):
#   scripts/preprod-cloud.sh data      # refresh the data from prod (DB + files)
#   scripts/preprod-cloud.sh secrets   # push Worker secrets (once, or after editing .env.preprod)
#   scripts/preprod-cloud.sh deploy    # deploy this checkout to preprod
#   scripts/preprod-cloud.sh all       # data, deploy, then secrets (first run)
#
# Data: the database is a Neon branch named "preprod", reset from its prod
# parent on every `data` run (copy-on-write, prod is only read). Files are
# copied from the prod R2 bucket into openinary-cloud-storage-preprod; the
# prod bucket is only listed and read.
#
# Isolated from prod on purpose (see env.preprod in both wrangler.jsonc):
# no crons (no Autumn metering, no Loops lifecycle emails, no sign-in probe),
# Autumn sandbox key, no PostHog, no Telegram, no Attio, no Turnstile, no
# support widget, its own session cookie prefix. Customers that exist only in
# prod Autumn show up on the free plan in preprod.
#
# Needs: wrangler logged in, `npx neonctl auth` done once, NEON_PROJECT_ID
# below, apps/cloud/server/.env (R2 keys, Autumn sandbox key).
set -euo pipefail

NEON_PROJECT_ID="${NEON_PROJECT_ID:-}"
NEON_BRANCH=preprod
PROD_BUCKET=openinary-cloud-storage
PREPROD_BUCKET=openinary-cloud-storage-preprod

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/apps/cloud/server"
WEB="$ROOT/apps/cloud/web"
PREPROD_ENV="$SERVER/.env.preprod" # gitignored, holds the preprod-only secrets

# Values from a dotenv file, without sourcing it (values hold & and quotes).
val() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
wrangler() { (cd "$1" && shift && command npx --no wrangler "$@"); }
neon() {
  [ -n "$NEON_PROJECT_ID" ] || { echo "Set NEON_PROJECT_ID (Neon console > project settings)." >&2; exit 1; }
  command npx --yes neonctl@2 "$@" --project-id "$NEON_PROJECT_ID"
}

data() {
  echo "== Database: Neon branch $NEON_BRANCH from prod"
  if neon branches get "$NEON_BRANCH" >/dev/null 2>&1; then
    neon branches reset "$NEON_BRANCH" --parent
  else
    neon branches create --name "$NEON_BRANCH"
  fi

  echo "== Files: $PROD_BUCKET -> $PREPROD_BUCKET (prod is only read)"
  AWS_ACCESS_KEY_ID="$(val "$SERVER/.env" R2_ACCESS_KEY_ID)" \
  AWS_SECRET_ACCESS_KEY="$(val "$SERVER/.env" R2_SECRET_ACCESS_KEY)" \
    aws s3 sync "s3://$PROD_BUCKET" "s3://$PREPROD_BUCKET" --delete --only-show-errors \
      --endpoint-url "$(val "$SERVER/.env" R2_ENDPOINT)" --region auto
  echo "Data refreshed."
}

secrets() {
  if [ ! -f "$PREPROD_ENV" ]; then
    # Its own auth secret: prod sessions copied with the DB stay unusable here.
    printf 'BETTER_AUTH_SECRET=%s\n# Optional: CLOUDFLARE_EMAIL_TOKEN=... to receive sign-in codes by email.\n# Without it the code is printed in `wrangler tail --env preprod` (run in apps/cloud/server).\n' \
      "$(openssl rand -hex 32)" >"$PREPROD_ENV"
    echo "Created $PREPROD_ENV"
  fi
  local db account
  db="$(neon connection-string "$NEON_BRANCH" --pooled)"
  account="$(wrangler "$SERVER" whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)"
  local json
  json="$(DB="$db" ACCOUNT="$account" \
    AUTH="$(val "$PREPROD_ENV" BETTER_AUTH_SECRET)" \
    MAIL="$(val "$PREPROD_ENV" CLOUDFLARE_EMAIL_TOKEN)" \
    AUTUMN="$(val "$SERVER/.env" AUTUMN_SECRET_KEY)" \
    R2_ID="$(val "$SERVER/.env" R2_ACCESS_KEY_ID)" \
    R2_KEY="$(val "$SERVER/.env" R2_SECRET_ACCESS_KEY)" \
    R2_URL="$(val "$SERVER/.env" R2_ENDPOINT)" \
    BUCKET="$PREPROD_BUCKET" node -e '
      const e = process.env;
      if (!e.AUTUMN.startsWith("am_sk_test_")) throw new Error("preprod needs the Autumn sandbox key (am_sk_test_)");
      const s = {
        DATABASE_URL: e.DB, BETTER_AUTH_SECRET: e.AUTH, AUTUMN_SECRET_KEY: e.AUTUMN,
        R2_ACCESS_KEY_ID: e.R2_ID, R2_SECRET_ACCESS_KEY: e.R2_KEY, R2_ENDPOINT: e.R2_URL,
        R2_BUCKET_NAME: e.BUCKET, CLOUDFLARE_ACCOUNT_ID: e.ACCOUNT,
      };
      if (e.MAIL) s.CLOUDFLARE_EMAIL_TOKEN = e.MAIL;
      process.stdout.write(JSON.stringify(s));
    ')"
  # The Worker must exist before it can hold secrets: first run deploys it.
  echo "$json" | wrangler "$SERVER" secret bulk --env preprod
}

deploy() {
  echo "== Server -> openinary-server-preprod"
  wrangler "$SERVER" deploy --env preprod
  echo "== Dashboard -> openinary-web-preprod"
  # NEXT_PUBLIC_* are baked in at build time and win over .env.production.
  (cd "$WEB" &&
    NEXT_PUBLIC_SERVER_URL=https://preprod-cdn.openinary.dev \
    NEXT_PUBLIC_ADMIN_URL= \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY= \
    NEXT_PUBLIC_COSSISTANT_API_KEY= \
      command npx --no opennextjs-cloudflare build &&
    command npx --no opennextjs-cloudflare deploy --env preprod)
  echo "Preprod: https://preprod-app.openinary.dev"
}

case "${1:-}" in
  data) data ;;
  secrets) secrets ;;
  deploy) deploy ;;
  all) data && deploy && secrets ;;
  *) sed -n '2,13p' "$0"; exit 1 ;;
esac
