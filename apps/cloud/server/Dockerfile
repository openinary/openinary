FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

WORKDIR /app

# Built from the monorepo root, not apps/cloud/server (see wrangler.jsonc's
# image_build_context), so the install can see pnpm-lock.yaml and patches/.
# Installing from the app's package.json alone, as this used to, meant the one
# process that actually runs @openinary/core ran it *unpatched* - the atomic
# cache write and the "don't cache a transient S3 error as a 404" fixes existed
# only in local node_modules - and resolved its caret ranges fresh on every
# uncached build, which is how the container ended up a minor version behind
# the repo (core 1.2.0, streaming the original mid-transcode, long after 1.3.0
# replaced that with a 202). Since the merge core is a workspace dependency
# built from source below, so that drift is now impossible by construction.
#
# Manifests first, sources after: the install layer is then only invalidated by
# a dependency change, not by every edit to api/.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/cloud/server/package.json ./apps/cloud/server/
COPY packages/core/package.json ./packages/core/
# Never imported here, but --frozen-lockfile compares the lockfile against
# every workspace project, and a missing one reads as "lockfile out of date".
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/marketing/package.json ./apps/marketing/
COPY apps/telemetry/package.json ./apps/telemetry/
COPY apps/cloud/web/package.json ./apps/cloud/web/
COPY apps/cloud/admin/package.json ./apps/cloud/admin/
COPY packages/ui/package.json ./packages/ui/
COPY packages/cli/package.json ./packages/cli/
COPY packages/registry/package.json ./packages/registry/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter cloud-server...

# core ships as source in the workspace, so the container builds the exact
# revision this commit carries instead of resolving a published range.
COPY packages/core ./packages/core
RUN pnpm --filter @openinary/core build

COPY apps/cloud/server ./apps/cloud/server
RUN pnpm --filter cloud-server run build

WORKDIR /app/apps/cloud/server

# @openinary/core's VideoWorker.processJob writes its downloaded source into
# ./temp without mkdir-ing it first (unlike prepareSourceFile, which does), so
# every video job dies with ENOENT unless an image transform happened to
# create the dir earlier in this instance's life. ./cache is created lazily by
# saveToCache, but costs nothing to pin here too.
RUN mkdir -p temp cache

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/api/index.js"]
