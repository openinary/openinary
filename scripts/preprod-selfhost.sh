#!/usr/bin/env bash
# Self-hosted preprod: install Openinary the way a user does, with the CLI and
# the Docker image built from this checkout's HEAD instead of a published
# release. Nothing is pushed to Docker Hub or npm.
#
# Usage (from the repo root, Docker running):
#   scripts/preprod-selfhost.sh fresh     # new install, interactive CLI prompts
#   scripts/preprod-selfhost.sh upgrade   # install the current release, then upgrade it to HEAD
#   scripts/preprod-selfhost.sh stop      # stop the instance
#   scripts/preprod-selfhost.sh clean     # stop it and delete its files and volumes
#
# The instance lives in ~/openinary-preprod (outside the repo), on
# http://localhost:3300 unless you pick another port in the prompts.
# Only committed code is built (git archive HEAD), like a release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${PREPROD_DIR:-$HOME/openinary-preprod}"
TAG=preprod
CLI="$ROOT/packages/cli/dist"

pnpm_() { (cd "$ROOT" && command pnpm "$@"); }

build() {
  echo "== Image openinary/openinary:$TAG from $(git -C "$ROOT" log -1 --format='%h %s')"
  [ -z "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ] ||
    echo "   (uncommitted changes are NOT in the image, commit them to test them)"
  git -C "$ROOT" archive --format=tar HEAD |
    docker build -f docker/full.Dockerfile -t "openinary/openinary:$TAG" -
  echo "== CLI from this checkout"
  pnpm_ --filter create-openinary build >/dev/null
}

use_preprod_image() {
  sed -i '' -E "s/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/" "$DIR/.env"
  node "$CLI/index.js" start --cwd "$DIR"
}

create() {
  [ ! -e "$DIR" ] || { echo "$DIR exists: run '$0 clean' first." >&2; exit 1; }
  node "$CLI/create.js" "$(basename "$DIR")" --cwd "$(dirname "$DIR")" --port 3300 "$@"
}

case "${1:-}" in
  fresh)
    build
    create --no-start
    use_preprod_image
    ;;
  upgrade)
    build
    create # pulls and starts the latest published release, like a real user
    read -r -p "Release running. Create some data (account, uploads), then press Enter to upgrade to HEAD... "
    use_preprod_image
    ;;
  stop) node "$CLI/index.js" stop --cwd "$DIR" ;;
  clean)
    [ -d "$DIR" ] && (cd "$DIR" && docker compose --profile full --profile api down -v)
    rm -rf "$DIR"
    ;;
  *) sed -n '2,13p' "$0"; exit 1 ;;
esac
