DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SiteConnectionStatus') THEN
    CREATE TYPE "SiteConnectionStatus" AS ENUM ('ONLINE', 'DEGRADED', 'OFFLINE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SiteRuntimeStatus" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "siteId" TEXT NOT NULL REFERENCES "Site"("id") ON DELETE CASCADE,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "status" "SiteConnectionStatus" NOT NULL DEFAULT 'OFFLINE',
  "frontendUrl" TEXT,
  "sdkVersion" TEXT,
  "connectorVersion" TEXT,
  "responseTimeMs" INTEGER,
  "supportedTasks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "capabilities" JSONB,
  "meta" JSONB,
  "lastError" TEXT,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "SiteRuntimeStatus_siteId_environment_key"
  ON "SiteRuntimeStatus"("siteId", "environment");

CREATE INDEX IF NOT EXISTS "SiteRuntimeStatus_status_lastHeartbeatAt_idx"
  ON "SiteRuntimeStatus"("status", "lastHeartbeatAt");



