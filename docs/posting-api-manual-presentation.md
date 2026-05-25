# Master Site Panel Posting API Manual

## 1. Purpose
This document explains how to publish posts manually or through automation tools into Master Site Panel for different task types.

Supported tasks:
- Article
- Business Listing
- Classified
- Image
- Social Bookmarking (SBM)
- PDF
- Profile
- Media Distribution
- Comment
- Social

---

## 2. Base URL
Use the production backend URL:

```text
https://masterpanel.seoparadox.com
```

Health check:

```http
GET https://masterpanel.seoparadox.com/health
```

---

## 3. Authentication
Every posting request requires a task API token.

Header:

```http
x-api-key: YOUR_TASK_TOKEN
Content-Type: application/json
```

Important rules:
- Each token is scoped to one site and one task.
- Example: an article token can post article content only.
- If token task and payload task do not match, API returns `403` or `400`.

---

## 4. Recommended Endpoint Format
Use the site-specific endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/{task}
```

Example:

```http
POST https://masterpanel.seoparadox.com/dailyshareinfo/post/v1/article
```

Legacy endpoint is also available:

```http
POST https://masterpanel.seoparadox.com/api/v1/tasks/{task}/posts
```

When using legacy endpoint, `siteCode` must be sent in the JSON body.

---

## 5. System Required Fields
These fields are required for every posting request.

| Field | Required | Notes |
|---|---:|---|
| `title` | Yes | Main post title. Used for post title and slug fallback. |
| `content` | Yes | Must be an object. Task-specific data goes here. |
| `siteCode` | Conditional | Required only for legacy endpoint. Not required in site-specific endpoint because site code is in URL. |

Recommended for every post:

| Field | Required | Notes |
|---|---:|---|
| `content.type` | Recommended | Should match endpoint task, e.g. `article`. If omitted, API can infer from endpoint. |
| `content.description` | Recommended | Main body/content. Frontend pages use this heavily. |
| `content.category` | Recommended | Category shown on pages and filters. Must be valid if sent. |
| `slug` | Optional | If missing, generated from title. If duplicate, API adds suffix like `-2`. |
| `summary` | Optional | Short card/search summary. |
| `metaTitle` | Optional | SEO title. |
| `metaDescription` | Optional | SEO description. |
| `tags` | Optional | Array of strings. |
| `authorName` | Optional | Display author/source name. |
| `media` | Optional | Array of media objects. Recommended for image-based UI. |
| `externalPostId` | Optional | Your system's unique ID for tracking. |

---

## 6. Standard Media Object
Use this format inside `media` array:

```json
{
  "url": "https://example.com/image.jpg",
  "type": "IMAGE",
  "alt": "Image alt text"
}
```

Common media types:
- `IMAGE`
- `PDF`
- `VIDEO`

---

## 7. Standard Success Response
Successful post creation returns `201`.

```json
{
  "success": true,
  "data": {
    "id": "post_id",
    "title": "Post title",
    "slug": "post-slug",
    "liveUrl": "https://site.com/article/post-slug",
    "task": "article"
  }
}
```

Use `liveUrl` for final backlink/reporting.

---

## 8. Common Error Responses
| Code | Meaning | Fix |
|---:|---|---|
| `400` | Missing field or invalid task/category | Check `title`, `content`, `content.type`, category. |
| `401` | Missing or invalid API key | Send correct `x-api-key`. |
| `403` | Token not allowed for site/task | Use correct task token for the selected site. |
| `404` | Site not found or inactive | Check `siteCode` and site status. |

---

# Task Payloads

## 9. Article Posting
Use for blog posts, editorial posts, and long-form content.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/article
```

Payload:

```json
{
  "title": "Best Travel Tips for a Comfortable Holiday",
  "slug": "best-travel-tips-for-a-comfortable-holiday",
  "summary": "A short overview of useful travel tips for planning a smooth holiday.",
  "metaTitle": "Best Travel Tips for a Comfortable Holiday",
  "metaDescription": "Read practical travel tips for planning a comfortable and stress-free holiday.",
  "tags": ["travel", "holiday", "guide"],
  "authorName": "Editorial Team",
  "content": {
    "type": "article",
    "category": "Travel",
    "description": "Full article body goes here. This can include long-form text, paragraphs, and formatted content.",
    "excerpt": "Short article intro shown on cards.",
    "featuredImage": "https://example.com/article-cover.jpg"
  },
  "media": [
    {
      "url": "https://example.com/article-cover.jpg",
      "type": "IMAGE",
      "alt": "Travel guide cover"
    }
  ],
  "externalPostId": "article-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = article`
- Recommended: `content.description`

Optional:
- `slug`, `summary`, `metaTitle`, `metaDescription`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `content.excerpt`, `content.featuredImage`

---

## 10. Business Listing Posting
Use for business directories, service listings, local listings, and marketplace entries.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/listing
```

Payload:

```json
{
  "title": "Omega Offers - Fast Cash Home Buying Solutions",
  "slug": "omega-offers-fast-cash-home-buying-solutions",
  "summary": "Trusted home buying service for fast and convenient property selling.",
  "tags": ["real estate", "home buying", "business listing"],
  "authorName": "Listing Desk",
  "content": {
    "type": "listing",
    "category": "Real Estate",
    "description": "Detailed business description, services, benefits, and customer trust points.",
    "price": 499,
    "currency": "USD",
    "location": "Houston, TX",
    "website": "https://example.com",
    "phone": "+1-999-999-9999",
    "address": "Houston, Texas",
    "logo": "https://example.com/logo.png",
    "highlights": ["Fast closing", "No repairs", "Local experts"],
    "rating": 4.9,
    "reviewCount": 27
  },
  "media": [
    {
      "url": "https://example.com/business-cover.jpg",
      "type": "IMAGE"
    }
  ],
  "externalPostId": "listing-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = listing`
- Recommended: `content.description`

Optional:
- `slug`, `summary`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `price`, `currency`, `location`, `website`, `phone`, `address`, `logo`, `highlights`, `rating`, `reviewCount`

---

## 11. Classified Posting
Use for classified ads, offers, deals, products, and short commercial posts.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/classified
```

Payload:

```json
{
  "title": "Affordable SAP Online Course with Certification",
  "slug": "affordable-sap-online-course-with-certification",
  "summary": "Join SAP training with certification and expert guidance.",
  "tags": ["sap", "training", "classified"],
  "authorName": "Classified Desk",
  "content": {
    "type": "classified",
    "category": "Education",
    "description": "Complete classified ad copy with offer details, eligibility, benefits, and contact instructions.",
    "price": 199,
    "currency": "USD",
    "location": "Online"
  },
  "media": [
    {
      "url": "https://example.com/classified.jpg",
      "type": "IMAGE"
    }
  ],
  "externalPostId": "classified-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = classified`
- Recommended: `content.description`

Optional:
- `slug`, `summary`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `price`, `currency`, `location`

---

## 12. Image Posting
Use for image-sharing, galleries, visual portfolios, and image-first posts.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/image
```

Payload:

```json
{
  "title": "Modern Outdoor Lighting Ideas for Beautiful Homes",
  "slug": "modern-outdoor-lighting-ideas-for-beautiful-homes",
  "summary": "A visual collection of outdoor lighting ideas for homes and gardens.",
  "tags": ["lighting", "gallery", "design"],
  "authorName": "Image Desk",
  "content": {
    "type": "image",
    "category": "Home Design",
    "description": "Short visual story or image collection description. Explain what the images represent."
  },
  "media": [
    {
      "url": "https://example.com/gallery-1.jpg",
      "type": "IMAGE",
      "alt": "Outdoor garden lighting"
    },
    {
      "url": "https://example.com/gallery-2.jpg",
      "type": "IMAGE",
      "alt": "Patio lighting setup"
    }
  ],
  "externalPostId": "image-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = image`
- Recommended: `media[]` with at least one image

Optional:
- `slug`, `summary`, `tags`, `authorName`, `externalPostId`
- `content.category`, `content.description`

---

## 13. Social Bookmarking (SBM) Posting
Use for bookmark-style resources and curated links.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/sbm
```

Payload:

```json
{
  "title": "Useful Guide to Smart Home Automation",
  "slug": "useful-guide-to-smart-home-automation",
  "summary": "A bookmarked resource about smart home automation systems.",
  "tags": ["smart home", "automation", "bookmark"],
  "authorName": "Bookmark Desk",
  "content": {
    "type": "sbm",
    "category": "Technology",
    "description": "Bookmark-style summary explaining why this resource is useful.",
    "sourceUrl": "https://example.com/smart-home-guide"
  },
  "media": [
    {
      "url": "https://example.com/bookmark-cover.jpg",
      "type": "IMAGE"
    }
  ],
  "externalPostId": "sbm-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = sbm`
- Recommended: `content.sourceUrl`

Optional:
- `slug`, `summary`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `content.description`

---

## 14. PDF Posting
Use for documents, PDFs, downloadable resources, reports, and guides.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/pdf
```

Payload:

```json
{
  "title": "Complete Home Lighting Design PDF Guide",
  "slug": "complete-home-lighting-design-pdf-guide",
  "summary": "Download a practical PDF guide for home lighting ideas.",
  "tags": ["pdf", "guide", "lighting"],
  "authorName": "PDF Desk",
  "content": {
    "type": "pdf",
    "category": "Home Improvement",
    "description": "Summary of the PDF document and what users can learn from it.",
    "fileUrl": "https://example.com/home-lighting-guide.pdf"
  },
  "media": [
    {
      "url": "https://example.com/pdf-cover.jpg",
      "type": "IMAGE"
    },
    {
      "url": "https://example.com/home-lighting-guide.pdf",
      "type": "PDF"
    }
  ],
  "externalPostId": "pdf-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = pdf`
- Recommended: `content.fileUrl`

Optional:
- `slug`, `summary`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `content.description`

---

## 15. Profile Posting
Use for personal profiles, company profiles, author pages, and identity pages.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/profile
```

Payload:

```json
{
  "title": "Vedish Astro - Astrology Consultant Profile",
  "slug": "vedishastro",
  "summary": "Professional astrology consultant profile with service details.",
  "tags": ["profile", "astrology", "consultant"],
  "authorName": "Profile Desk",
  "content": {
    "type": "profile",
    "category": "Consultant Profile",
    "description": "Bio, expertise, services, achievements, and contact information.",
    "website": "https://example.com",
    "phone": "+91-9999999999",
    "address": "Mumbai, India"
  },
  "media": [
    {
      "url": "https://example.com/profile-avatar.jpg",
      "type": "IMAGE"
    }
  ],
  "externalPostId": "profile-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = profile`
- Recommended: `content.description`

Optional:
- `slug`, `summary`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `website`, `phone`, `address`

---

## 16. Media Distribution Posting
Use for press-release style updates, news, announcements, and distribution posts.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/mediaDistribution
```

Accepted aliases in URL:
- `mediaDistribution`
- `mediadistribution`
- `media-distribution`
- `media_distribution`

Payload:

```json
{
  "title": "Company Announces New Service Expansion",
  "slug": "company-announces-new-service-expansion",
  "summary": "A short newsroom summary for the announcement.",
  "metaTitle": "Company Announces New Service Expansion",
  "metaDescription": "Read the latest company announcement and media update.",
  "tags": ["press release", "business", "announcement"],
  "authorName": "Media Desk",
  "content": {
    "type": "mediaDistribution",
    "category": "Business",
    "description": "Full announcement body or newsroom-style post content.",
    "excerpt": "Short summary for archive and homepage feeds.",
    "featuredImage": "https://example.com/press-cover.jpg",
    "publicationName": "Example Media Desk",
    "sourceUrl": "https://example.com/announcement"
  },
  "media": [
    {
      "url": "https://example.com/press-cover.jpg",
      "type": "IMAGE"
    }
  ],
  "externalPostId": "media-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = mediaDistribution`
- Recommended: `content.description`

Optional:
- `slug`, `summary`, `metaTitle`, `metaDescription`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `excerpt`, `featuredImage`, `publicationName`, `sourceUrl`

---

## 17. Comment Posting
Use for blog comments or commentary linked to an article.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/comment
```

Payload:

```json
{
  "title": "Helpful insights on the article",
  "slug": "helpful-insights-on-the-article",
  "summary": "A short comment summary.",
  "tags": ["comment", "feedback"],
  "authorName": "Reader Name",
  "content": {
    "type": "comment",
    "category": "Blog",
    "description": "The comment text or response content.",
    "articleSlug": "original-article-slug"
  },
  "externalPostId": "comment-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = comment`
- Recommended: `content.description`

Optional:
- `slug`, `summary`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `content.articleSlug`, `content.articleId`

Comment note:
- If `articleSlug` or `articleId` is not sent, API tries to attach the comment to a recent article from the same site/category.
- If no recent article exists, API returns `400`.

---

## 18. Social Posting
Use for short social-style campaigns or update posts.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/social
```

Payload:

```json
{
  "title": "New campaign update for customers",
  "slug": "new-campaign-update-for-customers",
  "summary": "Short campaign update summary.",
  "tags": ["social", "campaign"],
  "authorName": "Social Desk",
  "content": {
    "type": "social",
    "category": "Social Update",
    "description": "Short social-style post with CTA and engagement copy.",
    "callToAction": "Learn more",
    "targetUrl": "https://example.com/campaign"
  },
  "media": [
    {
      "url": "https://example.com/social-post.jpg",
      "type": "IMAGE"
    }
  ],
  "externalPostId": "social-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = social`
- Recommended: `content.description`

Optional:
- `slug`, `summary`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `callToAction`, `targetUrl`

---

## 19. Organization Posting
Use for organization, company, or team profile pages.

Endpoint:

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/org
```

Payload:

```json
{
  "title": "Example Organization Profile",
  "slug": "example-organization-profile",
  "summary": "Company profile and services overview.",
  "tags": ["organization", "company", "profile"],
  "authorName": "Organization Desk",
  "content": {
    "type": "org",
    "category": "Business",
    "description": "Organization overview, services, mission, and contact information.",
    "website": "https://example.com",
    "phone": "+91-9999999999",
    "address": "Mumbai, India"
  },
  "media": [
    {
      "url": "https://example.com/org-cover.jpg",
      "type": "IMAGE"
    }
  ],
  "externalPostId": "org-1001"
}
```

Mandatory:
- `title`
- `content`
- Recommended: `content.type = org`
- Recommended: `content.description`

Optional:
- `slug`, `summary`, `tags`, `authorName`, `media`, `externalPostId`
- `content.category`, `website`, `phone`, `address`

---

## 20. cURL Example
Replace:
- `{siteCode}` with actual site code
- `{task}` with task name
- `YOUR_TASK_TOKEN` with task API token

```bash
curl -X POST "https://masterpanel.seoparadox.com/{siteCode}/post/v1/{task}" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_TASK_TOKEN" \
  -d '{
    "title": "Example post title",
    "content": {
      "type": "article",
      "category": "General",
      "description": "Post body goes here."
    }
  }'
```

---

## 21. Manual Posting Steps
1. Select the target site.
2. Confirm the task enabled for that site.
3. Get the task-specific API token from Master Site Panel.
4. Choose the correct endpoint:
   `/{siteCode}/post/v1/{task}`
5. Prepare payload with `title` and `content`.
6. Keep `content.type` same as endpoint task.
7. Send request with `x-api-key` header.
8. Save the returned `liveUrl`.
9. Open `liveUrl` to verify the post is live.
10. If URL is not instantly updated, wait briefly or trigger site refresh/revalidate if available.

---

## 22. Important Validation Rules
- `title` and `content` are required.
- `content.type` must match the endpoint task if provided.
- Category must be valid if provided.
- Site must be active.
- Task must be enabled for that site.
- API token must have permission for that site and task.
- Duplicate slug is automatically handled by adding suffix like `-2`.

---

## 23. Recommended Minimum Payload
For fastest manual posting, use this minimum payload:

```json
{
  "title": "Example post title",
  "content": {
    "type": "article",
    "category": "General",
    "description": "Post body goes here."
  }
}
```

For legacy endpoint, add:

```json
{
  "siteCode": "example_site"
}
```

---

## 24. Quick Task Name Reference
| Task | URL Task Value | Main Route |
|---|---|---|
| Article | `article` | `/article/{slug}` |
| Business Listing | `listing` | `/listing/{slug}` |
| Classified | `classified` | `/classified/{slug}` |
| Image | `image` | `/image/{slug}` |
| Social Bookmarking | `sbm` | `/sbm/{slug}` |
| PDF | `pdf` | `/pdf/{slug}` |
| Profile | `profile` | `/profile/{slug}` |
| Media Distribution | `mediaDistribution` | `/updates/{slug}` |
| Comment | `comment` | linked to article URL |
| Social | `social` | `/community/{slug}` |
| Organization | `org` | `/team/{slug}` |

Note: Individual site themes can customize route paths, but API response `liveUrl` should be treated as final.
