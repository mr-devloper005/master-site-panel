# Posting API - Short Task Wise Manual

## Common Details

**Base URL**
```http
https://masterpanel.seoparadox.com
```

**Headers**
```http
Content-Type: application/json
x-api-key: YOUR_TASK_TOKEN
```

**API Format**
```http
POST /{siteCode}/post/v1/{task}
```

**Minimum Mandatory Fields For All Tasks**
- `title`
- `content.body`

**Common Optional Fields For All Tasks**
- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `tags`
- `authorName`
- `externalPostId`
- `media`

---

## 1. Article Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/article
```

**Payload**
```json
{
  "title": "Best Travel Tips for 2026",
  "slug": "best-travel-tips-for-2026",
  "summary": "Short summary of the article.",
  "content": {
    "body": "Full article content here."
  },
  "media": {
    "featuredImage": "https://example.com/image.jpg"
  },
  "tags": ["travel", "guide"],
  "authorName": "Admin"
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `media`, `tags`, `authorName`, `metaTitle`, `metaDescription`

---

## 2. Business Listing Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/listing
```

**Payload**
```json
{
  "title": "ABC Digital Services",
  "slug": "abc-digital-services",
  "summary": "Business listing short description.",
  "content": {
    "body": "Business details, services, address, phone, website and description."
  },
  "media": {
    "featuredImage": "https://example.com/logo.jpg"
  },
  "tags": ["business", "services"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `media`, `tags`, `metaTitle`, `metaDescription`

---

## 3. Classified Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/classified
```

**Payload**
```json
{
  "title": "Buy Used Car in Dubai",
  "slug": "buy-used-car-in-dubai",
  "summary": "Short classified description.",
  "content": {
    "body": "Complete classified details, offer, contact and description."
  },
  "media": {
    "featuredImage": "https://example.com/car.jpg"
  },
  "tags": ["classified", "car"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `media`, `tags`, `metaTitle`, `metaDescription`

---

## 4. Image Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/image
```

**Payload**
```json
{
  "title": "Beautiful Garden Lighting Ideas",
  "slug": "beautiful-garden-lighting-ideas",
  "summary": "Short image post description.",
  "content": {
    "body": "Image description and details."
  },
  "media": {
    "featuredImage": "https://example.com/garden-light.jpg",
    "gallery": [
      "https://example.com/image-1.jpg",
      "https://example.com/image-2.jpg"
    ]
  },
  "tags": ["image", "gallery"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `media.featuredImage`, `media.gallery`, `tags`

---

## 5. SBM Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/sbm
```

**Payload**
```json
{
  "title": "Best Garden Lighting Ideas",
  "slug": "best-garden-lighting-ideas",
  "summary": "Short SBM description.",
  "content": {
    "body": "Social bookmarking content/details."
  },
  "tags": ["sbm", "bookmark"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `tags`, `media`, `metaTitle`, `metaDescription`

---

## 6. PDF Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/pdf
```

**Payload**
```json
{
  "title": "Company Profile PDF",
  "slug": "company-profile-pdf",
  "summary": "Short PDF description.",
  "content": {
    "body": "PDF post description."
  },
  "media": {
    "pdfUrl": "https://example.com/file.pdf",
    "featuredImage": "https://example.com/pdf-cover.jpg"
  },
  "tags": ["pdf", "document"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `media.pdfUrl`, `media.featuredImage`, `tags`

---

## 7. Profile Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/profile
```

**Payload**
```json
{
  "title": "BestTravelz Profile",
  "slug": "bestravelz",
  "summary": "Short profile description.",
  "content": {
    "body": "Profile details, business information, links and description."
  },
  "media": {
    "featuredImage": "https://example.com/profile.jpg"
  },
  "tags": ["profile", "business"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `media`, `tags`, `metaTitle`, `metaDescription`

---

## 8. Media Distribution Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/mediaDistribution
```

**Payload**
```json
{
  "title": "Company Launches New Service",
  "slug": "company-launches-new-service",
  "summary": "Short press release summary.",
  "content": {
    "body": "Full press release or media distribution content."
  },
  "media": {
    "featuredImage": "https://example.com/press.jpg"
  },
  "tags": ["press", "news"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `media`, `tags`, `authorName`, `metaTitle`, `metaDescription`

---

## 9. Comment Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/comment
```

**Payload**
```json
{
  "title": "Comment on Travel Article",
  "slug": "comment-on-travel-article",
  "summary": "Short comment summary.",
  "content": {
    "body": "Comment content goes here."
  },
  "authorName": "User Name",
  "tags": ["comment"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `authorName`, `tags`, `media`

---

## 10. Social Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/social
```

**Payload**
```json
{
  "title": "Brand Social Update",
  "slug": "brand-social-update",
  "summary": "Short social post summary.",
  "content": {
    "body": "Social post content and details."
  },
  "media": {
    "featuredImage": "https://example.com/social.jpg"
  },
  "tags": ["social", "update"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `media`, `tags`, `authorName`

---

## 11. Organization Posting

**API**
```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/org
```

**Payload**
```json
{
  "title": "ABC Organization",
  "slug": "abc-organization",
  "summary": "Short organization description.",
  "content": {
    "body": "Organization details, services, team and contact information."
  },
  "media": {
    "featuredImage": "https://example.com/org.jpg"
  },
  "tags": ["organization", "company"]
}
```

**Mandatory**
- `title`
- `content.body`

**Optional**
- `slug`, `summary`, `media`, `tags`, `metaTitle`, `metaDescription`

---

## Success Response Example

```json
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "id": "post_id",
    "slug": "post-slug",
    "liveUrl": "https://example.com/article/post-slug"
  }
}
```

## Quick Notes

- `{siteCode}` means site ka code/domain code jo master panel me added hai.
- `{task}` means posting type like `article`, `listing`, `classified`, `image`, `sbm`, `pdf`, `profile`.
- Agar `slug` nahi bhejoge toh system title se slug generate kar dega.
- Best practice: `slug`, `summary`, `media.featuredImage`, `metaTitle`, `metaDescription` bhejna better hai.
