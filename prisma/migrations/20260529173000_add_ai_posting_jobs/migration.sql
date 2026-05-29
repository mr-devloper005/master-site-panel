CREATE TYPE "AiPostingJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

CREATE TYPE "AiPostingRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "AiPostingJob" (
  "id" TEXT NOT NULL,
  "apiKeyId" TEXT,
  "userId" TEXT,
  "status" "AiPostingJobStatus" NOT NULL DEFAULT 'QUEUED',
  "targetUrl" TEXT NOT NULL,
  "finalUrl" TEXT,
  "brandName" TEXT,
  "model" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "wordCount" INTEGER NOT NULL DEFAULT 600,
  "crawlAttempts" INTEGER NOT NULL DEFAULT 0,
  "httpStatus" INTEGER,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "extractedData" JSONB,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiPostingJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPostingRun" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "taskKey" TEXT NOT NULL,
  "status" "AiPostingRunStatus" NOT NULL DEFAULT 'PENDING',
  "postId" TEXT,
  "liveUrl" TEXT,
  "errorMessage" TEXT,
  "generatedPost" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiPostingRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiPostingJob_apiKeyId_createdAt_idx" ON "AiPostingJob"("apiKeyId", "createdAt");
CREATE INDEX "AiPostingJob_userId_createdAt_idx" ON "AiPostingJob"("userId", "createdAt");
CREATE INDEX "AiPostingJob_status_createdAt_idx" ON "AiPostingJob"("status", "createdAt");

CREATE INDEX "AiPostingRun_jobId_status_idx" ON "AiPostingRun"("jobId", "status");
CREATE INDEX "AiPostingRun_siteId_createdAt_idx" ON "AiPostingRun"("siteId", "createdAt");

ALTER TABLE "AiPostingJob" ADD CONSTRAINT "AiPostingJob_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiPostingJob" ADD CONSTRAINT "AiPostingJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "PanelUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiPostingRun" ADD CONSTRAINT "AiPostingRun_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "AiPostingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiPostingRun" ADD CONSTRAINT "AiPostingRun_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
