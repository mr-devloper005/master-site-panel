# Multi-Site Backend (100+ Sites)

Node + Express + Prisma + PostgreSQL backend for managing 100+ frontend sites (Next.js, React, plain HTML/CSS/JS) from one control plane.

## Why this architecture

- One backend for all sites.
- Site-level API permissions (`ApiKeySitePermission`) so only authorized keys can post.
- Standard public feed endpoint for every site: `GET /api/v1/public/:siteCode/feed`.
- One folder per site in `/sites/<siteCode>` for modular maintenance.

## Setup

```bash
npm install
cp .env.example .env
npm run db:up
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run seed:apikey
npm run dev
```

If you see `P1001: Can't reach database server at localhost:5432`, PostgreSQL is not running.
Start it with:

```bash
npm run db:up
```

## Frontend Master Panel Setup

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`, enter:
- Backend URL: `http://localhost:4000`
- API key: seeded admin key

## Core APIs

- `POST /api/v1/auth/keys` create API key (`keys:write`)
- `GET /api/v1/sites` list/search sites + post counts (`sites:read`)
- `POST /api/v1/sites` add site (`sites:write`)
- `PATCH /api/v1/sites/:siteId` update site (`sites:write`)
- `DELETE /api/v1/sites/:siteId` delete site + all posts (`sites:write`)
- `POST /api/v1/sites/:siteId/permissions` map API key to site (`sites:write`)
- `POST /api/v1/posts` publish content (`posts:write` + site permission)
- `GET /api/v1/posts` filter posts by site/search/status (`posts:read`)
- `PATCH /api/v1/posts/:postId` update post (`posts:write`)
- `DELETE /api/v1/posts/:postId` delete post (`posts:write`)
- `POST /api/v1/posts/bulk/delete` bulk delete posts (`posts:write`)
- `POST /api/v1/posts/bulk/update` bulk edit posts (`posts:write`)
- `GET /api/v1/public/:siteCode/feed` public data for frontend rendering

## Add a new site quickly

1. Create site module folder:

```bash
npm run site:add -- --code news_alpha --name "News Alpha" --framework NEXT_JS --category ARTICLE
```

2. Insert site record in backend:

```bash
curl -X POST http://localhost:4000/api/v1/sites \
  -H "x-api-key: <ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "code":"news_alpha",
    "name":"News Alpha",
    "framework":"NEXT_JS",
    "category":"ARTICLE",
    "theme":"modern-blog",
    "config":{"layout":"grid"}
  }'
```

3. Grant posting tool key permission to this site:

```bash
curl -X POST http://localhost:4000/api/v1/sites/<SITE_ID>/permissions \
  -H "x-api-key: <ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"apiKeyId":"<POSTING_TOOL_KEY_ID>","canPost":true,"canRead":true}'
```

## Common frontend snippet (same code on all sites)

```html
<script>
  async function loadSiteFeed(siteCode) {
    const res = await fetch(`https://YOUR_BACKEND/api/v1/public/${siteCode}/feed?limit=20`);
    const json = await res.json();
    if (!json.success) return;
    const posts = json.data.posts;
    console.log("Render this data with your site theme:", posts);
  }

  loadSiteFeed("news_alpha");
</script>
```

This keeps frontend logic same, while theme/layout differences remain local to each site UI.
