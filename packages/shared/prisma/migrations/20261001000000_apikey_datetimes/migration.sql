-- ApiKey date fields: BigInt (epoch ms, sqlite-era shape) -> timestamptz.
-- better-auth's Prisma adapter passes native Date objects for plugin fields
-- typed "date" (lastRefillAt, lastRequest, expiresAt, createdAt, updatedAt),
-- which BigInt columns reject. Aligns the model with the adapter's demands.
ALTER TABLE "apiKey" ALTER COLUMN "lastRefillAt" TYPE TIMESTAMP(3) USING NULL;
ALTER TABLE "apiKey" ALTER COLUMN "lastRequest" TYPE TIMESTAMP(3) USING NULL;
ALTER TABLE "apiKey" ALTER COLUMN "expiresAt" TYPE TIMESTAMP(3) USING NULL;
ALTER TABLE "apiKey" ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING CASE WHEN "createdAt" IS NULL THEN NULL ELSE to_timestamp("createdAt" / 1000.0) END;
ALTER TABLE "apiKey" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "apiKey" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "apiKey" ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING CASE WHEN "updatedAt" IS NULL THEN NULL ELSE to_timestamp("updatedAt" / 1000.0) END;
ALTER TABLE "apiKey" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "apiKey" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
