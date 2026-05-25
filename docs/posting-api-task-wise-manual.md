# Posting API Manual

Task-wise API, full payload, mandatory fields, optional fields, and suggested recommended payload.

---

## Common API Details

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
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/{task}
```

**Common Mandatory Fields For All Tasks**

- `title`
- `content.body`

**Common Optional Fields For All Tasks**

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.type`
- `content.category`
- `media.featuredImage`
- `media.logo`
- `media.gallery`
- `tags`
- `authorName`
- `externalPostId`

---

# 1. Article Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/article
```

## Full Payload

```json
{
  "title": "Best Travel Tips for 2026",
  "slug": "best-travel-tips-for-2026",
  "summary": "Short summary of the article.",
  "metaTitle": "Best Travel Tips for 2026",
  "metaDescription": "Read the best travel tips for planning your next trip in 2026.",
  "content": {
    "body": "Full article content goes here.",
    "type": "article",
    "category": "Travel",
    "excerpt": "Short article excerpt.",
    "sourceUrl": "https://example.com/source"
  },
  "media": {
    "featuredImage": "https://example.com/article-image.jpg",
    "logo": "https://example.com/logo.png",
    "gallery": [
      "https://example.com/image-1.jpg",
      "https://example.com/image-2.jpg"
    ]
  },
  "tags": ["travel", "guide", "tips"],
  "authorName": "Admin",
  "externalPostId": "external-article-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.type`
- `content.category`
- `content.excerpt`
- `content.sourceUrl`
- `media.featuredImage`
- `media.logo`
- `media.gallery`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "Best Travel Tips for 2026",
  "slug": "best-travel-tips-for-2026",
  "summary": "Short summary of the article.",
  "content": {
    "body": "Full article content goes here.",
    "category": "Travel"
  },
  "media": {
    "featuredImage": "https://example.com/article-image.jpg"
  },
  "tags": ["travel", "guide"],
  "authorName": "Admin"
}
```

---

# 2. Business Listing Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/listing
```

## Full Payload

```json
{
  "title": "ABC Digital Services",
  "slug": "abc-digital-services",
  "summary": "ABC Digital Services provides web design, SEO and marketing services.",
  "metaTitle": "ABC Digital Services - Business Listing",
  "metaDescription": "Find details about ABC Digital Services, services, contact and website.",
  "content": {
    "body": "Complete business details, services, address, phone number, email and website.",
    "type": "listing",
    "category": "Digital Services",
    "businessName": "ABC Digital Services",
    "description": "ABC Digital Services provides professional digital solutions.",
    "address": "New York, USA",
    "phone": "+1 999 999 9999",
    "email": "contact@example.com",
    "website": "https://example.com"
  },
  "media": {
    "featuredImage": "https://example.com/business-cover.jpg",
    "logo": "https://example.com/business-logo.png",
    "gallery": [
      "https://example.com/office-1.jpg",
      "https://example.com/office-2.jpg"
    ]
  },
  "tags": ["business", "services", "listing"],
  "authorName": "Admin",
  "externalPostId": "external-listing-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.category`
- `content.businessName`
- `content.description`
- `content.address`
- `content.phone`
- `content.email`
- `content.website`
- `media.featuredImage`
- `media.logo`
- `media.gallery`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "ABC Digital Services",
  "slug": "abc-digital-services",
  "summary": "ABC Digital Services provides web design, SEO and marketing services.",
  "content": {
    "body": "Complete business details, services, address, phone number, email and website.",
    "category": "Digital Services",
    "businessName": "ABC Digital Services",
    "phone": "+1 999 999 9999",
    "website": "https://example.com"
  },
  "media": {
    "featuredImage": "https://example.com/business-cover.jpg",
    "logo": "https://example.com/business-logo.png"
  },
  "tags": ["business", "services"]
}
```

---

# 3. Classified Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/classified
```

## Full Payload

```json
{
  "title": "Buy Used Car in Dubai",
  "slug": "buy-used-car-in-dubai",
  "summary": "Affordable used car available in Dubai.",
  "metaTitle": "Buy Used Car in Dubai",
  "metaDescription": "Check details for buying a used car in Dubai.",
  "content": {
    "body": "Complete classified ad content, product details, price, location and contact details.",
    "type": "classified",
    "category": "Automobile",
    "price": "AED 25000",
    "location": "Dubai",
    "condition": "Used",
    "contactName": "Sales Team",
    "phone": "+971 999 999 999",
    "email": "sales@example.com"
  },
  "media": {
    "featuredImage": "https://example.com/car.jpg",
    "logo": "https://example.com/logo.png",
    "gallery": [
      "https://example.com/car-1.jpg",
      "https://example.com/car-2.jpg"
    ]
  },
  "tags": ["classified", "car", "dubai"],
  "authorName": "Admin",
  "externalPostId": "external-classified-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.category`
- `content.price`
- `content.location`
- `content.condition`
- `content.contactName`
- `content.phone`
- `content.email`
- `media.featuredImage`
- `media.logo`
- `media.gallery`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "Buy Used Car in Dubai",
  "slug": "buy-used-car-in-dubai",
  "summary": "Affordable used car available in Dubai.",
  "content": {
    "body": "Complete classified ad content, product details, price, location and contact details.",
    "category": "Automobile",
    "price": "AED 25000",
    "location": "Dubai",
    "phone": "+971 999 999 999"
  },
  "media": {
    "featuredImage": "https://example.com/car.jpg",
    "gallery": [
      "https://example.com/car-1.jpg",
      "https://example.com/car-2.jpg"
    ]
  },
  "tags": ["classified", "car"]
}
```

---

# 4. Image Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/image
```

## Full Payload

```json
{
  "title": "Beautiful Garden Lighting Ideas",
  "slug": "beautiful-garden-lighting-ideas",
  "summary": "Explore beautiful garden lighting ideas.",
  "metaTitle": "Beautiful Garden Lighting Ideas",
  "metaDescription": "Best garden lighting ideas with images and details.",
  "content": {
    "body": "Image post description, details and visual explanation.",
    "type": "image",
    "category": "Garden",
    "caption": "Beautiful outdoor garden lighting setup.",
    "imageCredit": "Example Photographer"
  },
  "media": {
    "featuredImage": "https://example.com/garden-light.jpg",
    "logo": "https://example.com/logo.png",
    "gallery": [
      "https://example.com/garden-1.jpg",
      "https://example.com/garden-2.jpg",
      "https://example.com/garden-3.jpg"
    ]
  },
  "tags": ["image", "garden", "lighting"],
  "authorName": "Admin",
  "externalPostId": "external-image-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.category`
- `content.caption`
- `content.imageCredit`
- `media.featuredImage`
- `media.logo`
- `media.gallery`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "Beautiful Garden Lighting Ideas",
  "slug": "beautiful-garden-lighting-ideas",
  "summary": "Explore beautiful garden lighting ideas.",
  "content": {
    "body": "Image post description, details and visual explanation.",
    "category": "Garden",
    "caption": "Beautiful outdoor garden lighting setup."
  },
  "media": {
    "featuredImage": "https://example.com/garden-light.jpg",
    "gallery": [
      "https://example.com/garden-1.jpg",
      "https://example.com/garden-2.jpg"
    ]
  },
  "tags": ["image", "garden"]
}
```

---

# 5. SBM Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/sbm
```

## Full Payload

```json
{
  "title": "Best Garden Lighting Ideas",
  "slug": "best-garden-lighting-ideas",
  "summary": "Bookmark this useful garden lighting guide.",
  "metaTitle": "Best Garden Lighting Ideas",
  "metaDescription": "Useful social bookmarking post for garden lighting ideas.",
  "content": {
    "body": "Social bookmarking content, link details and short description.",
    "type": "sbm",
    "category": "Home Improvement",
    "targetUrl": "https://example.com/garden-lighting",
    "bookmarkTitle": "Garden Lighting Ideas"
  },
  "media": {
    "featuredImage": "https://example.com/bookmark.jpg",
    "logo": "https://example.com/logo.png"
  },
  "tags": ["sbm", "bookmark", "home"],
  "authorName": "Admin",
  "externalPostId": "external-sbm-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.category`
- `content.targetUrl`
- `content.bookmarkTitle`
- `media.featuredImage`
- `media.logo`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "Best Garden Lighting Ideas",
  "slug": "best-garden-lighting-ideas",
  "summary": "Bookmark this useful garden lighting guide.",
  "content": {
    "body": "Social bookmarking content, link details and short description.",
    "category": "Home Improvement",
    "targetUrl": "https://example.com/garden-lighting"
  },
  "media": {
    "featuredImage": "https://example.com/bookmark.jpg"
  },
  "tags": ["sbm", "bookmark"]
}
```

---

# 6. PDF Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/pdf
```

## Full Payload

```json
{
  "title": "Company Profile PDF",
  "slug": "company-profile-pdf",
  "summary": "Download or view the company profile PDF.",
  "metaTitle": "Company Profile PDF",
  "metaDescription": "View company profile PDF with complete details.",
  "content": {
    "body": "PDF description, document summary and details.",
    "type": "pdf",
    "category": "Document",
    "documentTitle": "Company Profile",
    "fileSize": "2 MB",
    "downloadText": "Download PDF"
  },
  "media": {
    "pdfUrl": "https://example.com/company-profile.pdf",
    "featuredImage": "https://example.com/pdf-cover.jpg",
    "logo": "https://example.com/logo.png"
  },
  "tags": ["pdf", "document", "profile"],
  "authorName": "Admin",
  "externalPostId": "external-pdf-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.category`
- `content.documentTitle`
- `content.fileSize`
- `content.downloadText`
- `media.pdfUrl`
- `media.featuredImage`
- `media.logo`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "Company Profile PDF",
  "slug": "company-profile-pdf",
  "summary": "Download or view the company profile PDF.",
  "content": {
    "body": "PDF description, document summary and details.",
    "category": "Document",
    "documentTitle": "Company Profile"
  },
  "media": {
    "pdfUrl": "https://example.com/company-profile.pdf",
    "featuredImage": "https://example.com/pdf-cover.jpg"
  },
  "tags": ["pdf", "document"]
}
```

---

# 7. Profile Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/profile
```

## Full Payload

```json
{
  "title": "BestTravelz Profile",
  "slug": "bestravelz",
  "summary": "BestTravelz offers travel packages, flights and hotel deals.",
  "metaTitle": "BestTravelz Profile",
  "metaDescription": "BestTravelz profile with services, details and contact information.",
  "content": {
    "body": "Profile details, company description, services, website and contact details.",
    "type": "profile",
    "category": "Travel",
    "profileName": "BestTravelz",
    "bio": "BestTravelz is a travel service provider.",
    "website": "https://example.com",
    "phone": "+91 99999 99999",
    "email": "contact@example.com",
    "location": "India"
  },
  "media": {
    "featuredImage": "https://example.com/profile-cover.jpg",
    "logo": "https://example.com/profile-logo.png",
    "avatar": "https://example.com/avatar.jpg"
  },
  "tags": ["profile", "travel", "business"],
  "authorName": "Admin",
  "externalPostId": "external-profile-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.category`
- `content.profileName`
- `content.bio`
- `content.website`
- `content.phone`
- `content.email`
- `content.location`
- `media.featuredImage`
- `media.logo`
- `media.avatar`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "BestTravelz Profile",
  "slug": "bestravelz",
  "summary": "BestTravelz offers travel packages, flights and hotel deals.",
  "content": {
    "body": "Profile details, company description, services, website and contact details.",
    "category": "Travel",
    "profileName": "BestTravelz",
    "website": "https://example.com"
  },
  "media": {
    "featuredImage": "https://example.com/profile-cover.jpg",
    "logo": "https://example.com/profile-logo.png"
  },
  "tags": ["profile", "travel"]
}
```

---

# 8. Media Distribution Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/mediaDistribution
```

## Full Payload

```json
{
  "title": "Company Launches New Service",
  "slug": "company-launches-new-service",
  "summary": "Company announces the launch of its new service.",
  "metaTitle": "Company Launches New Service",
  "metaDescription": "Official press release about the company launching a new service.",
  "content": {
    "body": "Full press release or media distribution content goes here.",
    "type": "mediaDistribution",
    "category": "Press Release",
    "companyName": "ABC Company",
    "location": "New York, USA",
    "releaseDate": "2026-05-25",
    "contactEmail": "press@example.com",
    "sourceUrl": "https://example.com/press-release"
  },
  "media": {
    "featuredImage": "https://example.com/press-image.jpg",
    "logo": "https://example.com/company-logo.png",
    "gallery": [
      "https://example.com/press-1.jpg",
      "https://example.com/press-2.jpg"
    ]
  },
  "tags": ["press", "news", "media"],
  "authorName": "Press Team",
  "externalPostId": "external-media-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.category`
- `content.companyName`
- `content.location`
- `content.releaseDate`
- `content.contactEmail`
- `content.sourceUrl`
- `media.featuredImage`
- `media.logo`
- `media.gallery`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "Company Launches New Service",
  "slug": "company-launches-new-service",
  "summary": "Company announces the launch of its new service.",
  "content": {
    "body": "Full press release or media distribution content goes here.",
    "category": "Press Release",
    "companyName": "ABC Company",
    "location": "New York, USA",
    "releaseDate": "2026-05-25"
  },
  "media": {
    "featuredImage": "https://example.com/press-image.jpg",
    "logo": "https://example.com/company-logo.png"
  },
  "tags": ["press", "news"]
}
```

---

# 9. Comment Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/comment
```

## Full Payload

```json
{
  "title": "Comment on Travel Article",
  "slug": "comment-on-travel-article",
  "summary": "User comment on a travel article.",
  "metaTitle": "Comment on Travel Article",
  "metaDescription": "Comment content submitted for article engagement.",
  "content": {
    "body": "This is the comment content.",
    "type": "comment",
    "category": "Comment",
    "targetUrl": "https://example.com/article/best-travel-tips",
    "targetTitle": "Best Travel Tips",
    "commenterName": "User Name",
    "commenterEmail": "user@example.com"
  },
  "media": {
    "avatar": "https://example.com/avatar.jpg"
  },
  "tags": ["comment", "engagement"],
  "authorName": "User Name",
  "externalPostId": "external-comment-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.targetUrl`
- `content.targetTitle`
- `content.commenterName`
- `content.commenterEmail`
- `media.avatar`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "Comment on Travel Article",
  "slug": "comment-on-travel-article",
  "summary": "User comment on a travel article.",
  "content": {
    "body": "This is the comment content.",
    "targetUrl": "https://example.com/article/best-travel-tips",
    "commenterName": "User Name"
  },
  "authorName": "User Name",
  "tags": ["comment"]
}
```

---

# 10. Social Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/social
```

## Full Payload

```json
{
  "title": "Brand Social Update",
  "slug": "brand-social-update",
  "summary": "Short social update summary.",
  "metaTitle": "Brand Social Update",
  "metaDescription": "Social update post with brand message and image.",
  "content": {
    "body": "Social post content, update, announcement or community message.",
    "type": "social",
    "category": "Community",
    "platform": "Website",
    "profileName": "ABC Brand",
    "profileUrl": "https://example.com/profile"
  },
  "media": {
    "featuredImage": "https://example.com/social-image.jpg",
    "logo": "https://example.com/logo.png",
    "avatar": "https://example.com/avatar.jpg"
  },
  "tags": ["social", "community", "update"],
  "authorName": "Admin",
  "externalPostId": "external-social-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.category`
- `content.platform`
- `content.profileName`
- `content.profileUrl`
- `media.featuredImage`
- `media.logo`
- `media.avatar`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "Brand Social Update",
  "slug": "brand-social-update",
  "summary": "Short social update summary.",
  "content": {
    "body": "Social post content, update, announcement or community message.",
    "category": "Community",
    "profileName": "ABC Brand"
  },
  "media": {
    "featuredImage": "https://example.com/social-image.jpg",
    "avatar": "https://example.com/avatar.jpg"
  },
  "tags": ["social", "community"]
}
```

---

# 11. Organization Posting

## API

```http
POST https://masterpanel.seoparadox.com/{siteCode}/post/v1/org
```

## Full Payload

```json
{
  "title": "ABC Organization",
  "slug": "abc-organization",
  "summary": "ABC Organization provides professional services.",
  "metaTitle": "ABC Organization",
  "metaDescription": "ABC Organization details, services, team and contact information.",
  "content": {
    "body": "Organization description, services, team, location and contact details.",
    "type": "org",
    "category": "Organization",
    "organizationName": "ABC Organization",
    "description": "ABC Organization provides professional services.",
    "website": "https://example.com",
    "phone": "+1 999 999 9999",
    "email": "info@example.com",
    "address": "New York, USA"
  },
  "media": {
    "featuredImage": "https://example.com/org-cover.jpg",
    "logo": "https://example.com/org-logo.png",
    "gallery": [
      "https://example.com/team-1.jpg",
      "https://example.com/team-2.jpg"
    ]
  },
  "tags": ["organization", "company", "services"],
  "authorName": "Admin",
  "externalPostId": "external-org-001"
}
```

## Mandatory

- `title`
- `content.body`

## Optional

- `slug`
- `summary`
- `metaTitle`
- `metaDescription`
- `content.category`
- `content.organizationName`
- `content.description`
- `content.website`
- `content.phone`
- `content.email`
- `content.address`
- `media.featuredImage`
- `media.logo`
- `media.gallery`
- `tags`
- `authorName`
- `externalPostId`

## Suggested Payload

```json
{
  "title": "ABC Organization",
  "slug": "abc-organization",
  "summary": "ABC Organization provides professional services.",
  "content": {
    "body": "Organization description, services, team, location and contact details.",
    "category": "Organization",
    "organizationName": "ABC Organization",
    "website": "https://example.com"
  },
  "media": {
    "featuredImage": "https://example.com/org-cover.jpg",
    "logo": "https://example.com/org-logo.png"
  },
  "tags": ["organization", "company"]
}
```

---

# Success Response Example

```json
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "id": "post_id",
    "slug": "best-travel-tips-for-2026",
    "liveUrl": "https://example.com/article/best-travel-tips-for-2026"
  }
}
```

---

# Important Notes

- `{siteCode}` URL me pass hoga.
- `{task}` URL me pass hoga.
- `title` aur `content.body` har task me required hai.
- `slug` optional hai. Agar slug nahi bheja toh system title se slug generate kar sakta hai.
- `media.featuredImage` recommended hai, especially `article`, `classified`, `image`, `pdf`, `mediaDistribution` ke liye.
- `media.logo` recommended hai `listing`, `profile`, `org`, `mediaDistribution` ke liye.
- `media.gallery` recommended hai `image`, `classified`, `listing`, `org` ke liye.
- `metaTitle` aur `metaDescription` SEO ke liye recommended hai.
