-- Fast exact backlink/detail lookup by site + slug.
CREATE INDEX IF NOT EXISTS "Post_siteId_status_slug_idx" ON "Post"("siteId", "status", "slug");
