-- Activity log port (upstream's onboarding/activity-log feature, sqlite → pg).
-- Creates the three tables upstream created in ActivityLog's constructor DDL.
-- No sqlite backfill INSERT..SELECT here: that rebuilt delivery_counts from
-- existing sqlite delivery_log rows on upgrade; this repo is Prisma-only
-- greenfield (no sqlite data exists to backfill), and the init migration
-- already shipped without these tables, so CREATE TABLE alone is correct.

-- CreateTable
CREATE TABLE "delivery_log" (
    "id" SERIAL NOT NULL,
    "t" TIMESTAMP(3) NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" INTEGER NOT NULL,

    CONSTRAINT "delivery_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_counts" (
    "hour" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "delivered" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,

    CONSTRAINT "delivery_counts_pkey" PRIMARY KEY ("hour","kind")
);

-- CreateTable
CREATE TABLE "app_state" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "app_state_pkey" PRIMARY KEY ("key")
);
