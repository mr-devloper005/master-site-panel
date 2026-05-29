"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFallbackArticleHtml = exports.extractPageData = exports.validateAiPostingPayload = exports.inferTaskForSite = exports.AI_POSTING_MIN_CONTENT_CHARS = exports.AI_POSTING_DEFAULT_WORD_COUNT = exports.AI_POSTING_MAX_TARGETS = void 0;
const client_1 = require("@prisma/client");
const site_contract_1 = require("../sites/site-contract");
exports.AI_POSTING_MAX_TARGETS = 20;
exports.AI_POSTING_DEFAULT_WORD_COUNT = 600;
exports.AI_POSTING_MIN_CONTENT_CHARS = 280;
const collapseWhitespace = (value) => value.replace(/\s+/g, " ").trim();
const inferTaskForSite = (site) => {
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    if (config.supportedTasks?.length === 1)
        return config.supportedTasks[0];
    switch (site.category) {
        case client_1.SiteCategory.ARTICLE:
            return "article";
        case client_1.SiteCategory.SBM:
            return "sbm";
        case client_1.SiteCategory.IMAGE_SHARING:
            return "image";
        case client_1.SiteCategory.LOCAL_LISTING:
            return "listing";
        case client_1.SiteCategory.MEDIA_DISTRIBUTION:
            return "mediaDistribution";
        case client_1.SiteCategory.PROFILE:
            return "profile";
        default:
            return config.supportedTasks?.[0] || null;
    }
};
exports.inferTaskForSite = inferTaskForSite;
const validateAiPostingPayload = (payload) => {
    const targetUrl = String(payload.targetUrl || "").trim();
    const brandName = String(payload.brandName || "").trim() || null;
    const targets = Array.isArray(payload.targets) ? payload.targets : [];
    if (!targetUrl) {
        return { ok: false, message: "targetUrl is required." };
    }
    try {
        const parsed = new URL(targetUrl);
        if (!/^https?:$/i.test(parsed.protocol)) {
            return { ok: false, message: "Target URL is invalid." };
        }
    }
    catch {
        return { ok: false, message: "Target URL is invalid." };
    }
    if (!targets.length) {
        return { ok: false, message: "targets[] is required." };
    }
    if (targets.length > exports.AI_POSTING_MAX_TARGETS) {
        return { ok: false, message: `Maximum ${exports.AI_POSTING_MAX_TARGETS} targets are allowed per request.` };
    }
    const duplicateGuard = new Set();
    for (const target of targets) {
        const identity = [target.siteId, target.siteCode, target.siteName].filter(Boolean).join("|").toLowerCase();
        if (!identity) {
            return { ok: false, message: "Each target must include siteId, siteCode, or siteName." };
        }
        if (duplicateGuard.has(identity)) {
            return { ok: false, message: "Duplicate sites are not allowed in targets[]." };
        }
        duplicateGuard.add(identity);
    }
    return {
        ok: true,
        value: {
            targetUrl,
            brandName,
            targets,
        },
    };
};
exports.validateAiPostingPayload = validateAiPostingPayload;
const extractTagContent = (html, tagName) => {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
    const match = html.match(regex);
    return collapseWhitespace((match?.[1] || "").replace(/<[^>]+>/g, " "));
};
const extractMetaContent = (html, name) => {
    const regex = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const match = html.match(regex);
    return collapseWhitespace(match?.[1] || "");
};
const extractLogoUrl = (html) => {
    const ogImage = extractMetaContent(html, "og:image");
    if (ogImage)
        return ogImage;
    const imgMatch = html.match(/<img[^>]+(?:class|id|alt)=["'][^"']*(?:logo|brand)[^"']*["'][^>]+src=["']([^"']+)["']/i)
        || html.match(/<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id|alt)=["'][^"']*(?:logo|brand)[^"']*["']/i);
    return imgMatch?.[1] || null;
};
const extractPageData = (html) => {
    const title = extractTagContent(html, "title");
    const h1 = extractTagContent(html, "h1");
    const metaDescription = extractMetaContent(html, "description");
    const cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
        .replace(/<header[\s\S]*?<\/header>/gi, " ")
        .replace(/<[^>]+>/g, " ");
    const contentText = collapseWhitespace(cleaned);
    return {
        title,
        h1,
        metaDescription,
        logoUrl: extractLogoUrl(html),
        contentText,
        hasEnoughContent: contentText.length >= exports.AI_POSTING_MIN_CONTENT_CHARS,
    };
};
exports.extractPageData = extractPageData;
const buildFallbackArticleHtml = ({ brandName, targetUrl, title, }) => {
    const label = brandName || title || "this business";
    return [
        `<p>${label} continues to stand out by offering a clear, useful experience for customers looking for dependable information and services online.</p>`,
        `<p>This page highlights the core value of the brand in a simple way, making it easier for visitors to understand what is offered and why it matters.</p>`,
        `<p>Readers who want more details can visit <a href="${targetUrl}" target="_blank" rel="noopener noreferrer">${targetUrl}</a> to explore the original page directly.</p>`,
        `<p>Even when source details are limited, the most important takeaway is that the page provides a direct path for learning more, checking services, and understanding the business offering.</p>`,
        `<p><strong>Conclusion:</strong> If you want a quick overview and the latest details, visit the source page and explore the brand directly for updated information and next steps.</p>`,
    ].join("");
};
exports.buildFallbackArticleHtml = buildFallbackArticleHtml;
