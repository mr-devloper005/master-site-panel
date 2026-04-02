"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTaskCatalog = exports.buildTaskProvisioningGuide = void 0;
const baseExample = {
    siteCode: "example_site",
    title: "Example post title",
    slug: "example-post-title",
    summary: "Short summary shown on cards and search results.",
    metaTitle: "Custom SEO title for this page",
    metaDescription: "Custom SEO description for this page. Search engines and social previews should prefer this when provided.",
    tags: ["seo", "content"],
    authorName: "Site Master Pro",
};
const taskPayloads = {
    listing: {
        ...baseExample,
        content: {
            type: "listing",
            category: "SEO Agency",
            description: "Long listing description with service details and trust signals.",
            price: 499,
            currency: "USD",
            location: "Delhi",
            website: "https://example.com",
            phone: "+91-9999999999",
            address: "Connaught Place, Delhi",
            logo: "https://example.com/logo.png",
            highlights: ["Local SEO", "Backlink outreach", "Monthly reporting"],
            rating: 4.9,
            reviewCount: 27,
        },
        media: [
            { url: "https://example.com/listing-1.jpg", type: "IMAGE" },
            { url: "https://example.com/listing-2.jpg", type: "IMAGE" },
        ],
    },
    article: {
        ...baseExample,
        content: {
            type: "article",
            category: "Marketing",
            description: "Article body or formatted rich text payload for editorial pages.",
            excerpt: "Optional standfirst for article cards.",
            featuredImage: "https://example.com/article-cover.jpg",
        },
        media: [{ url: "https://example.com/article-cover.jpg", type: "IMAGE" }],
    },
    image: {
        ...baseExample,
        content: {
            type: "image",
            category: "Gallery",
            description: "Short visual story or image collection description.",
        },
        media: [
            { url: "https://example.com/gallery-1.jpg", type: "IMAGE" },
            { url: "https://example.com/gallery-2.jpg", type: "IMAGE" },
        ],
    },
    profile: {
        ...baseExample,
        content: {
            type: "profile",
            category: "Creator Profile",
            description: "Bio, expertise, and contact information for a profile page.",
            website: "https://example.com",
            phone: "+91-9999999999",
            address: "Mumbai, India",
        },
        media: [{ url: "https://example.com/profile-avatar.jpg", type: "IMAGE" }],
    },
    classified: {
        ...baseExample,
        content: {
            type: "classified",
            category: "For Sale",
            description: "Classified ad copy with offer terms and contact details.",
            price: 199,
            currency: "USD",
            location: "Gurugram",
        },
        media: [{ url: "https://example.com/classified-item.jpg", type: "IMAGE" }],
    },
    social: {
        ...baseExample,
        content: {
            type: "social",
            category: "Social Update",
            description: "Short social-style post with CTA and engagement copy.",
            callToAction: "Learn more",
            targetUrl: "https://example.com/campaign",
        },
        media: [{ url: "https://example.com/social-post.jpg", type: "IMAGE" }],
    },
    sbm: {
        ...baseExample,
        content: {
            type: "sbm",
            category: "Research",
            description: "Bookmark-style entry with link metadata.",
            sourceUrl: "https://example.com/resource",
        },
        media: [{ url: "https://example.com/bookmark-cover.jpg", type: "IMAGE" }],
    },
    comment: {
        ...baseExample,
        content: {
            type: "comment",
            category: "Blog",
            description: "Contextual response or commentary for a blog post.",
            articleSlug: "original-article-slug",
        },
        media: [{ url: "https://example.com/comment-cover.jpg", type: "IMAGE" }],
    },
    pdf: {
        ...baseExample,
        content: {
            type: "pdf",
            category: "Education",
            description: "Downloadable PDF resource with summary and metadata.",
            fileUrl: "https://example.com/resource.pdf",
        },
        media: [{ url: "https://example.com/pdf-cover.jpg", type: "IMAGE" }],
    },
    org: {
        ...baseExample,
        content: {
            type: "org",
            category: "Business",
            description: "Organization profile with services and contact info.",
            website: "https://example.com",
            phone: "+91-9999999999",
            address: "Mumbai, India",
        },
        media: [{ url: "https://example.com/org-cover.jpg", type: "IMAGE" }],
    },
};
const taskDescriptions = {
    listing: "Service, business, or marketplace listings with commercial metadata.",
    article: "Editorial posts, blog articles, and knowledge content.",
    image: "Image-first posts and gallery content.",
    profile: "Profile and business identity pages.",
    classified: "Classified or short offer-style content.",
    social: "Short-form social or campaign posts.",
    sbm: "Bookmarking or curated resource posts.",
    comment: "Commentary or response posts linked to other content.",
    pdf: "PDF resources, downloads, or document listings.",
    org: "Organization or company profile posts.",
};
const taskUsage = {
    listing: [
        "Use this when the site should publish business or directory-style entries.",
        "Send gallery images in media[] and business fields inside content.",
        "This token is scoped to the selected site and listing task only.",
    ],
    article: [
        "Use this for blog, editorial, or long-form article publishing.",
        "Keep rich article fields inside content and the hero image in media[].",
        "This token is scoped to the selected site and article task only.",
    ],
    image: [
        "Use this for gallery, portfolio, or image-sharing style posts.",
        "Send every image in media[] so the frontend gallery can render cleanly.",
        "This token is scoped to the selected site and image task only.",
    ],
    profile: [
        "Use this for profile pages, business identity pages, or local profile content.",
        "Store contact and bio data inside content for flexible frontend mapping.",
        "This token is scoped to the selected site and profile task only.",
    ],
    classified: [
        "Use this for offer-style, deal-style, or classified publishing.",
        "Include price, location, and offer details inside content.",
        "This token is scoped to the selected site and classified task only.",
    ],
    social: [
        "Use this for short social-style content and campaigns.",
        "Keep CTA and destination URL inside content for reuse across site themes.",
        "This token is scoped to the selected site and social task only.",
    ],
    sbm: [
        "Use this for social bookmarking entries.",
        "Send the sourceUrl inside content for the original resource.",
        "This token is scoped to the selected site and sbm task only.",
    ],
    comment: [
        "Use this for blog commentary or response posts.",
        "Include parentUrl to link back to the original post.",
        "This token is scoped to the selected site and comment task only.",
    ],
    pdf: [
        "Use this for PDF resources and document listings.",
        "Include fileUrl to the PDF asset.",
        "This token is scoped to the selected site and pdf task only.",
    ],
    org: [
        "Use this for organization profiles and business identity pages.",
        "Include contact details in content for reuse across themes.",
        "This token is scoped to the selected site and org task only.",
    ],
};
const buildTaskProvisioningGuide = (task, siteCode, backendBaseUrl) => {
    const baseUrl = (backendBaseUrl || "").replace(/\/+$/, "");
    const siteEndpointPath = `/${siteCode}/post/v1/${task}`;
    const siteEndpoint = `${baseUrl}${siteEndpointPath}`;
    const legacyEndpoint = `${baseUrl}/api/v1/tasks/${task}/posts`;
    const payload = {
        ...taskPayloads[task],
        siteCode,
    };
    return {
        task,
        label: task.charAt(0).toUpperCase() + task.slice(1),
        description: taskDescriptions[task],
        endpointPath: siteEndpointPath,
        endpoint: siteEndpoint,
        legacyEndpointPath: `/api/v1/tasks/${task}/posts`,
        legacyEndpoint,
        payload,
        usage: taskUsage[task],
        curlExample: [
            `curl -X POST ${siteEndpoint || siteEndpointPath} \\`,
            '  -H "Content-Type: application/json" \\',
            '  -H "x-api-key: YOUR_TASK_TOKEN" \\',
            `  -d '${JSON.stringify(payload, null, 2)}'`,
        ].join("\n"),
    };
};
exports.buildTaskProvisioningGuide = buildTaskProvisioningGuide;
const buildTaskCatalog = (siteCode, backendBaseUrl) => ({
    availableTasks: Object.keys(taskPayloads).map((task) => (0, exports.buildTaskProvisioningGuide)(task, siteCode, backendBaseUrl)),
});
exports.buildTaskCatalog = buildTaskCatalog;
