-- Bulk backlink/detail lookups must never scan large feeds.
-- These indexes keep direct public slug lookup fast as Post grows into millions of rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_public_slug_type_lookup_idx"
ON "Post" ("siteId", "status", "slug", ((content->>'type')))
WHERE "slug" IS NOT NULL;

-- Listing/feed pages filter by task and sort by latest published post.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_public_feed_type_published_idx"
ON "Post" ("siteId", "status", ((content->>'type')), "publishedAt" DESC);

-- Category pages and footer/category feeds filter by category and sort by latest published post.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_public_feed_category_published_idx"
ON "Post" ("siteId", "status", ((content->>'category')), "publishedAt" DESC);
