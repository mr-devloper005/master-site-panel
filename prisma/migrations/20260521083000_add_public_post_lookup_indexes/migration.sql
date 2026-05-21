-- Bulk backlink/detail lookups must never scan large feeds.
-- Prisma runs migrations in a transaction on this deployment path, so do not use CONCURRENTLY here.
-- For very large existing production databases, apply equivalent CONCURRENTLY indexes manually first,
-- then mark this migration as applied.
CREATE INDEX IF NOT EXISTS "Post_public_slug_type_lookup_idx"
ON "Post" ("siteId", "status", "slug", ((content->>'type')))
WHERE "slug" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Post_public_feed_type_published_idx"
ON "Post" ("siteId", "status", ((content->>'type')), "publishedAt" DESC);

CREATE INDEX IF NOT EXISTS "Post_public_feed_category_published_idx"
ON "Post" ("siteId", "status", ((content->>'category')), "publishedAt" DESC);
