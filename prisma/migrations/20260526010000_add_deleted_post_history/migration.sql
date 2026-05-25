CREATE TABLE "DeletedPost" (
    "id" TEXT NOT NULL,
    "originalPostId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "siteCode" TEXT NOT NULL,
    "siteName" TEXT NOT NULL,
    "externalPostId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "summary" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "content" JSONB NOT NULL,
    "media" JSONB,
    "tags" TEXT[],
    "authorName" TEXT,
    "status" "PostStatus" NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdByApiKeyId" TEXT,
    "originalCreatedAt" TIMESTAMP(3) NOT NULL,
    "originalUpdatedAt" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "deletedByApiKeyId" TEXT,
    "deletedByName" TEXT,
    "deletionSource" TEXT NOT NULL DEFAULT 'posts',
    "deletionReason" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoreUntil" TIMESTAMP(3) NOT NULL,
    "restoredAt" TIMESTAMP(3),
    "restoredByApiKeyId" TEXT,

    CONSTRAINT "DeletedPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeletedPost_deletedAt_idx" ON "DeletedPost"("deletedAt");
CREATE INDEX "DeletedPost_restoreUntil_idx" ON "DeletedPost"("restoreUntil");
CREATE INDEX "DeletedPost_siteId_deletedAt_idx" ON "DeletedPost"("siteId", "deletedAt");
CREATE INDEX "DeletedPost_originalPostId_idx" ON "DeletedPost"("originalPostId");
CREATE INDEX "DeletedPost_slug_idx" ON "DeletedPost"("slug");
