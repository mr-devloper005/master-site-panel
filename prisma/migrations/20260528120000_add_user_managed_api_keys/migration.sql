CREATE TYPE "PanelUserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

CREATE TYPE "ApiActivityStatus" AS ENUM ('SUCCESS', 'FAILED', 'BLOCKED');

CREATE TABLE "PanelUser" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" "PanelUserStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "rateLimitPerMinute" INTEGER,
  "dailyPostLimit" INTEGER,
  "totalPostLimit" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PanelUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSiteTaskAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "taskKey" TEXT NOT NULL,
  "canRead" BOOLEAN NOT NULL DEFAULT true,
  "canPost" BOOLEAN NOT NULL DEFAULT true,
  "canEdit" BOOLEAN NOT NULL DEFAULT false,
  "canDelete" BOOLEAN NOT NULL DEFAULT false,
  "perMinuteLimit" INTEGER,
  "dailyLimit" INTEGER,
  "totalLimit" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserSiteTaskAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiActivityLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "apiKeyId" TEXT,
  "siteId" TEXT,
  "postId" TEXT,
  "taskKey" TEXT,
  "action" TEXT NOT NULL,
  "status" "ApiActivityStatus" NOT NULL,
  "reason" TEXT,
  "method" TEXT,
  "path" TEXT,
  "ipAddress" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApiActivityLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ApiKey"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "lastUsedIp" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "PanelUser_email_key" ON "PanelUser"("email");
CREATE INDEX "PanelUser_status_createdAt_idx" ON "PanelUser"("status", "createdAt");
CREATE INDEX "PanelUser_name_idx" ON "PanelUser"("name");

CREATE UNIQUE INDEX "UserSiteTaskAccess_userId_siteId_taskKey_key" ON "UserSiteTaskAccess"("userId", "siteId", "taskKey");
CREATE INDEX "UserSiteTaskAccess_siteId_taskKey_isActive_idx" ON "UserSiteTaskAccess"("siteId", "taskKey", "isActive");
CREATE INDEX "UserSiteTaskAccess_userId_isActive_idx" ON "UserSiteTaskAccess"("userId", "isActive");

CREATE INDEX "ApiKey_userId_isActive_idx" ON "ApiKey"("userId", "isActive");

CREATE INDEX "ApiActivityLog_userId_createdAt_idx" ON "ApiActivityLog"("userId", "createdAt");
CREATE INDEX "ApiActivityLog_apiKeyId_createdAt_idx" ON "ApiActivityLog"("apiKeyId", "createdAt");
CREATE INDEX "ApiActivityLog_siteId_taskKey_createdAt_idx" ON "ApiActivityLog"("siteId", "taskKey", "createdAt");
CREATE INDEX "ApiActivityLog_status_createdAt_idx" ON "ApiActivityLog"("status", "createdAt");
CREATE INDEX "ApiActivityLog_postId_idx" ON "ApiActivityLog"("postId");

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "PanelUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserSiteTaskAccess" ADD CONSTRAINT "UserSiteTaskAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "PanelUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSiteTaskAccess" ADD CONSTRAINT "UserSiteTaskAccess_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiActivityLog" ADD CONSTRAINT "ApiActivityLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "PanelUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiActivityLog" ADD CONSTRAINT "ApiActivityLog_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiActivityLog" ADD CONSTRAINT "ApiActivityLog_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiActivityLog" ADD CONSTRAINT "ApiActivityLog_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
