"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const async_handler_1 = require("../../utils/async-handler");
const api_key_service_1 = require("../auth/api-key-service");
const runtime_store_1 = require("../runtime/runtime-store");
const base_url_1 = require("../../utils/base-url");
const task_catalog_1 = require("./task-catalog");
const google_indexing_1 = require("./google-indexing");
const indexnow_1 = require("./indexnow");
const site_contract_1 = require("./site-contract");
const router = (0, express_1.Router)();
const backendBaseUrl = () => (0, base_url_1.getBaseUrl)();
const SITEMAP_TIMEOUT_MS = 8000;
const SEO_TIMEOUT_MS = 9000;
const LINK_HEALTH_TIMEOUT_MS = 15000;
const normalizeSiteCategory = (value) => {
    if (typeof value !== "string")
        return undefined;
    const normalized = value.trim().toUpperCase();
    if (normalized === "IMAGES")
        return client_1.SiteCategory.IMAGE_SHARING;
    if (normalized === "MEDIA_DISTRIBUTION" || normalized === "MEDIADISTRIBUTION") {
        return client_1.SiteCategory.MEDIA_DISTRIBUTION;
    }
    if (normalized in client_1.SiteCategory)
        return normalized;
    return undefined;
};
const normalizeTaskValue = (value) => {
    const raw = Array.isArray(value) ? value[0] : value;
    const normalized = String(raw || "").trim().toLowerCase();
    if (normalized === "blog-commenting" || normalized === "blog_commenting") {
        return "comment";
    }
    if (normalized === "mediadistribution" ||
        normalized === "media-distribution" ||
        normalized === "media_distribution") {
        return "mediaDistribution";
    }
    return normalized;
};
const firstQueryValue = (value) => {
    if (Array.isArray(value))
        return String(value[0] || "");
    if (typeof value === "string")
        return value;
    return "";
};
const provisionTaskToken = async (site, task) => {
    const taskKey = await (0, api_key_service_1.createApiKeyWithPermissions)({
        name: `${site.code}-${task}-publisher`,
        task,
        siteIds: [site.id],
        canPost: true,
        canRead: true,
    });
    const guide = (0, task_catalog_1.buildTaskProvisioningGuide)(task, site.code, backendBaseUrl());
    return {
        ...guide,
        key: taskKey,
        token: taskKey.rawApiKey,
    };
};
const extractSitemapUrls = (xml) => [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)]
    .map((match) => match[1]?.trim())
    .filter((value) => Boolean(value));
const parseHost = (url) => {
    if (!url)
        return null;
    try {
        return new URL(url).host;
    }
    catch {
        return null;
    }
};
const pathFromUrl = (value) => {
    try {
        const parsed = new URL(value);
        const path = parsed.pathname || "/";
        return path === "/" ? "/" : path.replace(/\/+$/, "");
    }
    catch {
        return "/";
    }
};
const resolvePageTemplateRule = (templates, path) => {
    if (!templates || typeof templates !== "object")
        return null;
    if (path in templates)
        return templates[path];
    const matches = Object.entries(templates)
        .filter(([key]) => {
        if (!key || key === "/")
            return false;
        return path === key || path.startsWith(`${key}/`);
    })
        .sort((a, b) => b[0].length - a[0].length);
    return matches.length ? matches[0][1] : null;
};
const normalizeAbsoluteUrlList = (items) => {
    if (!Array.isArray(items))
        return [];
    return Array.from(new Set(items
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => /^https?:\/\//i.test(item))));
};
const hasTag = (html, pattern) => pattern.test(html);
const getFirstMatch = (html, pattern) => {
    const match = html.match(pattern);
    return match && typeof match[1] === "string" ? match[1] : null;
};
const countMatches = (html, pattern) => {
    const matches = html.match(pattern);
    return matches ? matches.length : 0;
};
const extractImageStats = (html) => {
    const imgTags = html.match(/<img\b[^>]*>/gi) || [];
    const total = imgTags.length;
    const withAlt = imgTags.filter((tag) => /\balt\s*=\s*(['"])(.*?)\1/i.test(tag)).length;
    const withMeaningfulAlt = imgTags.filter((tag) => {
        const match = tag.match(/\balt\s*=\s*(['"])(.*?)\1/i);
        if (!match || typeof match[2] !== "string")
            return false;
        return match[2].trim().length >= 4;
    }).length;
    const lazyLoaded = imgTags.filter((tag) => /\bloading\s*=\s*(['"])lazy\1/i.test(tag)).length;
    const withDimensions = imgTags.filter((tag) => /\bwidth\s*=\s*(['"])\d+\1/i.test(tag) && /\bheight\s*=\s*(['"])\d+\1/i.test(tag)).length;
    return { total, withAlt, withMeaningfulAlt, lazyLoaded, withDimensions };
};
const extractLinkStats = (html, siteHost) => {
    const linkTags = html.match(/<a\b[^>]*href\s*=\s*(['"])(.*?)\1[^>]*>[\s\S]*?<\/a>/gi) || [];
    let total = 0;
    let internal = 0;
    let descriptive = 0;
    for (const tag of linkTags) {
        const href = getFirstMatch(tag, /\bhref\s*=\s*['"]([^'"]+)['"]/i);
        if (!href)
            continue;
        total += 1;
        const textOnly = tag.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const wordCount = textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0;
        if (wordCount >= 2)
            descriptive += 1;
        if (href.startsWith("/")) {
            internal += 1;
            continue;
        }
        if (siteHost) {
            try {
                const parsed = new URL(href);
                if (parsed.host === siteHost)
                    internal += 1;
            }
            catch {
                // ignore malformed urls
            }
        }
    }
    return { total, internal, descriptive };
};
const extractHeadingStats = (html) => ({
    h1: countMatches(html, /<h1\b[^>]*>[\s\S]*?<\/h1>/gi),
    h2: countMatches(html, /<h2\b[^>]*>[\s\S]*?<\/h2>/gi),
    h3Plus: countMatches(html, /<h[3-6]\b[^>]*>[\s\S]*?<\/h[3-6]>/gi),
});
const inspectSeoTags = (html, options) => {
    const policy = {
        minInternalLinksPerPage: 5,
        requireAltText: true,
        minAltLength: 8,
        enforceLazyLoading: true,
        requireSingleH1: true,
        minH2Count: 1,
        ...options?.policy,
    };
    const titleTag = getFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)?.trim() || "";
    const canonicalHref = getFirstMatch(html, /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i);
    const metaDescription = getFirstMatch(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.trim() || "";
    const imageStats = extractImageStats(html);
    const linkStats = extractLinkStats(html, options?.siteHost || null);
    const headingStats = extractHeadingStats(html);
    const normalizedCanonical = canonicalHref ? canonicalHref.split("#")[0].replace(/\/+$/, "") : "";
    const normalizedUrl = options?.url ? options.url.split("#")[0].replace(/\/+$/, "") : "";
    const checks = {
        titleTag: Boolean(titleTag),
        metaDescription: hasTag(html, /<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i),
        metaDescriptionLength: metaDescription.length >= 120 && metaDescription.length <= 180,
        canonical: hasTag(html, /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]*href=["'][^"']+["'][^>]*>/i),
        canonicalSelf: !normalizedUrl || !normalizedCanonical
            ? Boolean(normalizedCanonical)
            : normalizedCanonical === normalizedUrl,
        robotsMeta: hasTag(html, /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*(index|follow)[^"']*["'][^>]*>/i),
        viewport: hasTag(html, /<meta[^>]+name=["']viewport["'][^>]*content=["'][^"']+["'][^>]*>/i),
        ogTitle: hasTag(html, /<meta[^>]+property=["']og:title["'][^>]*content=["'][^"']+["'][^>]*>/i),
        ogDescription: hasTag(html, /<meta[^>]+property=["']og:description["'][^>]*content=["'][^"']+["'][^>]*>/i),
        ogImage: hasTag(html, /<meta[^>]+property=["']og:image["'][^>]*content=["'][^"']+["'][^>]*>/i),
        ogUrl: hasTag(html, /<meta[^>]+property=["']og:url["'][^>]*content=["'][^"']+["'][^>]*>/i),
        twitterCard: hasTag(html, /<meta[^>]+name=["']twitter:card["'][^>]*content=["'][^"']+["'][^>]*>/i),
        jsonLd: hasTag(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i),
        h1: headingStats.h1 >= 1,
        singleH1: policy.requireSingleH1 ? headingStats.h1 === 1 : headingStats.h1 >= 1,
        h2Coverage: headingStats.h2 >= policy.minH2Count,
        internalLinks: linkStats.internal >= policy.minInternalLinksPerPage,
        imageAltCoverage: !policy.requireAltText || imageStats.total === 0
            ? true
            : imageStats.withMeaningfulAlt >= imageStats.total,
        imageLazyLoading: !policy.enforceLazyLoading || imageStats.total === 0
            ? true
            : imageStats.lazyLoaded >= imageStats.total,
    };
    if (options?.articleDetail) {
        checks.author = hasTag(html, /(<meta[^>]+name=["']author["'][^>]*content=["'][^"']+["'][^>]*>)|(<span[^>]*>[^<]*by[^<]*<\/span>)/i);
        checks.publishDate = hasTag(html, /(<meta[^>]+property=["']article:published_time["'][^>]*>)|(<time[^>]*datetime=["'][^"']+["'][^>]*>)/i);
        checks.category = hasTag(html, /(category|badge|tag)/i);
        checks.tags = hasTag(html, /(tags?|badge|tag)/i);
        checks.featuredImage = checks.ogImage;
    }
    const missing = Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([key]) => key);
    return {
        checks,
        missing,
        metrics: {
            titleLength: titleTag.length,
            metaDescriptionLength: metaDescription.length,
            headings: headingStats,
            images: imageStats,
            links: linkStats,
            canonical: canonicalHref,
        },
    };
};
const fetchTextWithTimeout = async (url, accept, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: { Accept: accept },
            cache: "no-store",
            signal: controller.signal,
        });
        const body = await response.text();
        return { response, body };
    }
    finally {
        clearTimeout(timeout);
    }
};
const parsePositiveInt = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.min(Math.max(Math.floor(parsed), min), max);
};
const buildSeoAuditPolicy = (blueprint, pageRule) => ({
    // Route-level rule can override minimum internal links for that path.
    minInternalLinksPerPage: typeof pageRule?.["minInternalLinks"] === "number"
        ? Number(pageRule["minInternalLinks"])
        : (blueprint?.internalLinkPolicy?.minInternalLinksPerPage ?? 5),
    requireAltText: blueprint?.imagePolicy?.requireAltText ?? true,
    minAltLength: blueprint?.imagePolicy?.minAltLength ?? 8,
    enforceLazyLoading: blueprint?.imagePolicy?.enforceLazyLoading ?? true,
    requireSingleH1: blueprint?.headingPolicy?.requireSingleH1 ?? true,
    minH2Count: blueprint?.headingPolicy?.minH2Count ?? 1,
});
const inspectPageSeo = async (page, frontendUrl, blueprint) => {
    const pagePath = pathFromUrl(page.url);
    const pageRule = resolvePageTemplateRule(blueprint?.pageTemplates, pagePath);
    try {
        const { response, body } = await fetchTextWithTimeout(page.url, "text/html,*/*", SEO_TIMEOUT_MS);
        if (!response.ok) {
            return {
                page: page.key,
                path: pagePath,
                url: page.url,
                reachable: false,
                httpStatus: response.status,
                checks: {},
                missing: ["pageUnreachable"],
                metrics: null,
            };
        }
        const inspected = inspectSeoTags(body, {
            articleDetail: page.articleDetail,
            url: page.url,
            siteHost: parseHost(frontendUrl),
            policy: buildSeoAuditPolicy(blueprint, pageRule),
        });
        return {
            page: page.key,
            path: pagePath,
            url: page.url,
            reachable: true,
            httpStatus: response.status,
            checks: inspected.checks,
            missing: inspected.missing,
            metrics: inspected.metrics,
        };
    }
    catch (error) {
        return {
            page: page.key,
            path: pagePath,
            url: page.url,
            reachable: false,
            httpStatus: null,
            checks: {},
            missing: ["pageUnreachable"],
            metrics: null,
            error: error instanceof Error ? error.message : "Failed to fetch page",
        };
    }
};
router.get("/", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const search = req.query.search?.toString().trim();
    const framework = req.query.framework?.toString();
    const category = req.query.category?.toString();
    const isActive = req.query.isActive?.toString();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const where = {};
    if (search) {
        where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
        ];
    }
    if (framework && framework in client_1.SiteFramework) {
        where.framework = framework;
    }
    const normalizedCategory = normalizeSiteCategory(category);
    if (normalizedCategory) {
        where.category = normalizedCategory;
    }
    if (isActive === "true" || isActive === "false") {
        where.isActive = isActive === "true";
    }
    const sites = await db_1.prisma.site.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
            _count: {
                select: { posts: true },
            },
        },
    });
    const total = await db_1.prisma.site.count({ where });
    const runtimeMap = await (0, runtime_store_1.getLatestRuntimeStatusMap)(sites.map((site) => site.id));
    res.json({
        success: true,
        data: sites.map((site) => ({
            ...site,
            runtimeStatuses: runtimeMap.get(site.id) ? [runtimeMap.get(site.id)] : [],
            config: (0, site_contract_1.sanitizeSiteConfig)(site.config),
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config, {
                backendBaseUrl: backendBaseUrl(),
                includeTaskCatalog: true,
            }),
        })),
        meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
}));
router.get("/:siteId", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        include: {
            _count: { select: { posts: true } },
            posts: {
                orderBy: { createdAt: "desc" },
                take: 5,
                select: {
                    id: true,
                    title: true,
                    status: true,
                    publishedAt: true,
                    createdAt: true,
                },
            },
        },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const runtimeStatuses = await (0, runtime_store_1.getRuntimeStatusesForSite)(siteId);
    res.json({
        success: true,
        data: {
            ...site,
            runtimeStatuses,
            config: (0, site_contract_1.sanitizeSiteConfig)(site.config),
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config, {
                backendBaseUrl: backendBaseUrl(),
                includeTaskCatalog: true,
            }),
        },
    });
}));
router.get("/:siteId/sitemap-status", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true, isActive: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const frontendUrl = (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
    const includeAll = req.query.all === "true";
    if (!frontendUrl) {
        throw new api_error_1.ApiError(400, "Site frontend URL is missing. Update site config first.");
    }
    const sitemapUrl = `${frontendUrl}/sitemap.xml`;
    const manualUrls = normalizeAbsoluteUrlList(config.sitemapManualUrls);
    const excludedUrls = normalizeAbsoluteUrlList(config.sitemapExcludedUrls);
    const siteHost = parseHost(frontendUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SITEMAP_TIMEOUT_MS);
    const checkedAt = new Date().toISOString();
    try {
        const response = await fetch(sitemapUrl, {
            method: "GET",
            headers: { Accept: "application/xml,text/xml,*/*" },
            cache: "no-store",
            signal: controller.signal,
        });
        const body = await response.text();
        const urls = response.ok ? extractSitemapUrls(body) : [];
        const effectiveUrls = Array.from(new Set([...urls, ...manualUrls].filter((url) => !excludedUrls.includes(url))));
        const mismatched = siteHost
            ? effectiveUrls.filter((url) => parseHost(url) && parseHost(url) !== siteHost)
            : [];
        res.json({
            success: true,
            data: {
                siteId: site.id,
                siteCode: site.code,
                siteName: site.name,
                sitemapUrl,
                checkedAt,
                reachable: response.ok,
                httpStatus: response.status,
                urlCount: effectiveUrls.length,
                sampleUrls: effectiveUrls.slice(0, 12),
                manualUrlsCount: manualUrls.length,
                excludedUrlsCount: excludedUrls.length,
                ...(includeAll ? { urls: effectiveUrls } : {}),
                hostExpected: siteHost,
                hostMismatchCount: mismatched.length,
                hostMismatchSamples: mismatched.slice(0, 5),
            },
        });
        return;
    }
    catch (error) {
        res.status(200).json({
            success: true,
            data: {
                siteId: site.id,
                siteCode: site.code,
                siteName: site.name,
                sitemapUrl,
                checkedAt,
                reachable: false,
                httpStatus: null,
                urlCount: 0,
                sampleUrls: [],
                manualUrlsCount: manualUrls.length,
                excludedUrlsCount: excludedUrls.length,
                ...(includeAll ? { urls: [] } : {}),
                hostExpected: siteHost,
                hostMismatchCount: 0,
                hostMismatchSamples: [],
                error: error instanceof Error ? error.message : "Failed to fetch sitemap.",
            },
        });
        return;
    }
    finally {
        clearTimeout(timeout);
    }
}));
router.get("/:siteId/sitemap-config", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    res.json({
        success: true,
        data: {
            siteId: site.id,
            siteCode: site.code,
            siteName: site.name,
            sitemapManualUrls: normalizeAbsoluteUrlList(config.sitemapManualUrls),
            sitemapExcludedUrls: normalizeAbsoluteUrlList(config.sitemapExcludedUrls),
            frontendUrl: config.frontendUrl || config.liveUrl || config.siteUrl || null,
            updatedAt: new Date().toISOString(),
        },
    });
}));
router.patch("/:siteId/sitemap-config", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const currentConfig = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const manualUrls = normalizeAbsoluteUrlList(req.body?.sitemapManualUrls ?? currentConfig.sitemapManualUrls);
    const excludedUrls = normalizeAbsoluteUrlList(req.body?.sitemapExcludedUrls ?? currentConfig.sitemapExcludedUrls);
    const nextConfig = {
        ...currentConfig,
        sitemapManualUrls: manualUrls,
        sitemapExcludedUrls: excludedUrls,
    };
    const updated = await db_1.prisma.site.update({
        where: { id: site.id },
        data: { config: nextConfig },
        select: { id: true, code: true, name: true, config: true, updatedAt: true },
    });
    res.json({
        success: true,
        data: {
            siteId: updated.id,
            siteCode: updated.code,
            siteName: updated.name,
            sitemapManualUrls: manualUrls,
            sitemapExcludedUrls: excludedUrls,
            updatedAt: updated.updatedAt,
        },
    });
}));
router.get("/:siteId/indexnow-config", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true, updatedAt: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const resolved = (0, indexnow_1.getIndexNowConfig)(site.config);
    res.json({
        success: true,
        data: {
            siteId: site.id,
            siteCode: site.code,
            siteName: site.name,
            indexNowEnabled: config.indexNowEnabled !== false,
            indexNowHost: config.indexNowHost || resolved?.host || "",
            indexNowKey: config.indexNowKey || "",
            indexNowKeyLocation: config.indexNowKeyLocation || "",
            indexNowEndpoint: config.indexNowEndpoint || "https://api.indexnow.org/indexnow",
            indexNowLastSubmittedAt: config.indexNowLastSubmittedAt || null,
            indexNowLastSubmittedCount: config.indexNowLastSubmittedCount || 0,
            indexNowLastStatus: config.indexNowLastStatus || null,
            indexNowLastError: config.indexNowLastError || null,
            updatedAt: site.updatedAt.toISOString(),
        },
    });
}));
router.patch("/:siteId/indexnow-config", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true, updatedAt: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const currentConfig = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const nextConfig = {
        ...currentConfig,
        indexNowEnabled: typeof req.body?.indexNowEnabled === "boolean"
            ? req.body.indexNowEnabled
            : currentConfig.indexNowEnabled !== false,
        indexNowHost: typeof req.body?.indexNowHost === "string"
            ? req.body.indexNowHost.trim()
            : currentConfig.indexNowHost,
        indexNowKey: typeof req.body?.indexNowKey === "string"
            ? req.body.indexNowKey.trim()
            : currentConfig.indexNowKey,
        indexNowKeyLocation: typeof req.body?.indexNowKeyLocation === "string"
            ? req.body.indexNowKeyLocation.trim()
            : currentConfig.indexNowKeyLocation,
        indexNowEndpoint: typeof req.body?.indexNowEndpoint === "string" && req.body.indexNowEndpoint.trim()
            ? req.body.indexNowEndpoint.trim()
            : currentConfig.indexNowEndpoint || "https://api.indexnow.org/indexnow",
    };
    const updated = await db_1.prisma.site.update({
        where: { id: site.id },
        data: { config: nextConfig },
        select: { id: true, code: true, name: true, config: true, updatedAt: true },
    });
    const sanitized = (0, site_contract_1.sanitizeSiteConfig)(updated.config);
    res.json({
        success: true,
        data: {
            siteId: updated.id,
            siteCode: updated.code,
            siteName: updated.name,
            indexNowEnabled: sanitized.indexNowEnabled !== false,
            indexNowHost: sanitized.indexNowHost || "",
            indexNowKey: sanitized.indexNowKey || "",
            indexNowKeyLocation: sanitized.indexNowKeyLocation || "",
            indexNowEndpoint: sanitized.indexNowEndpoint || "https://api.indexnow.org/indexnow",
            updatedAt: updated.updatedAt.toISOString(),
        },
    });
}));
router.post("/:siteId/indexnow/submit", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    let urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
    if (!urls.length && req.body?.includeTracked !== false) {
        const tracked = await db_1.prisma.siteIndexingRecord.findMany({
            where: { siteId: site.id },
            orderBy: [{ updatedAt: "desc" }],
            take: 10000,
            select: { url: true },
        });
        urls = tracked.map((item) => item.url);
    }
    try {
        const result = await (0, indexnow_1.submitUrlsToIndexNow)({
            siteId: site.id,
            siteConfig: site.config,
            urls,
        });
        if (!result.submitted) {
            throw new api_error_1.ApiError(400, result.reason || "IndexNow submission failed.");
        }
        res.json({
            success: true,
            data: {
                siteId: site.id,
                siteCode: site.code,
                siteName: site.name,
                ...result,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "IndexNow submission failed.";
        await db_1.prisma.site.update({
            where: { id: site.id },
            data: {
                config: {
                    ...(0, site_contract_1.sanitizeSiteConfig)(site.config),
                    indexNowLastSubmittedAt: new Date().toISOString(),
                    indexNowLastStatus: "ERROR",
                    indexNowLastError: message,
                },
            },
        });
        throw new api_error_1.ApiError(400, message);
    }
}));
router.get("/:siteId/seo-config", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true, updatedAt: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    res.json({
        success: true,
        data: {
            siteId: site.id,
            siteCode: site.code,
            siteName: site.name,
            seoDefaults: config.seoDefaults || {
                defaultTitle: "",
                titleTemplate: "",
                defaultDescription: "",
                defaultOgImage: "",
                keywords: [],
            },
            seoPages: config.seoPages || {},
            seoBlueprint: config.seoBlueprint || {
                urlStructure: {},
                headingPolicy: {},
                imagePolicy: {},
                internalLinkPolicy: {},
                schemaPolicy: { enabledTypes: [] },
                defaults: {},
                pageTemplates: {},
            },
            seoUpdatedAt: config.seoUpdatedAt || site.updatedAt.toISOString(),
        },
    });
}));
router.patch("/:siteId/seo-config", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const currentConfig = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const normalized = (0, site_contract_1.sanitizeSiteConfig)({
        ...currentConfig,
        seoDefaults: req.body?.seoDefaults,
        seoPages: req.body?.seoPages,
        seoBlueprint: req.body?.seoBlueprint,
        seoUpdatedAt: new Date().toISOString(),
    });
    const updated = await db_1.prisma.site.update({
        where: { id: site.id },
        data: { config: normalized },
        select: { id: true, code: true, name: true, config: true, updatedAt: true },
    });
    const updatedConfig = (0, site_contract_1.sanitizeSiteConfig)(updated.config);
    res.json({
        success: true,
        data: {
            siteId: updated.id,
            siteCode: updated.code,
            siteName: updated.name,
            seoDefaults: updatedConfig.seoDefaults || {
                defaultTitle: "",
                titleTemplate: "",
                defaultDescription: "",
                defaultOgImage: "",
                keywords: [],
            },
            seoPages: updatedConfig.seoPages || {},
            seoBlueprint: updatedConfig.seoBlueprint || {
                urlStructure: {},
                headingPolicy: {},
                imagePolicy: {},
                internalLinkPolicy: {},
                schemaPolicy: { enabledTypes: [] },
                defaults: {},
                pageTemplates: {},
            },
            seoUpdatedAt: updatedConfig.seoUpdatedAt || updated.updatedAt.toISOString(),
        },
    });
}));
router.get("/:siteId/seo-blueprint", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true, updatedAt: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    res.json({
        success: true,
        data: {
            siteId: site.id,
            siteCode: site.code,
            siteName: site.name,
            seoBlueprint: config.seoBlueprint || {
                urlStructure: {},
                headingPolicy: {},
                imagePolicy: {},
                internalLinkPolicy: {},
                schemaPolicy: { enabledTypes: [] },
                defaults: {},
                pageTemplates: {},
            },
            seoUpdatedAt: config.seoUpdatedAt || site.updatedAt.toISOString(),
        },
    });
}));
router.patch("/:siteId/seo-blueprint", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const currentConfig = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const normalized = (0, site_contract_1.sanitizeSiteConfig)({
        ...currentConfig,
        seoBlueprint: req.body?.seoBlueprint,
        seoUpdatedAt: new Date().toISOString(),
    });
    const updated = await db_1.prisma.site.update({
        where: { id: site.id },
        data: { config: normalized },
        select: { id: true, code: true, name: true, config: true, updatedAt: true },
    });
    const updatedConfig = (0, site_contract_1.sanitizeSiteConfig)(updated.config);
    res.json({
        success: true,
        data: {
            siteId: updated.id,
            siteCode: updated.code,
            siteName: updated.name,
            seoBlueprint: updatedConfig.seoBlueprint || {
                urlStructure: {},
                headingPolicy: {},
                imagePolicy: {},
                internalLinkPolicy: {},
                schemaPolicy: { enabledTypes: [] },
                defaults: {},
                pageTemplates: {},
            },
            seoUpdatedAt: updatedConfig.seoUpdatedAt || updated.updatedAt.toISOString(),
        },
    });
}));
router.get("/:siteId/seo-status", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const blueprint = config.seoBlueprint;
    const frontendUrl = (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
    if (!frontendUrl) {
        throw new api_error_1.ApiError(400, "Site frontend URL is missing. Update site config first.");
    }
    const checkedAt = new Date().toISOString();
    const includeAll = firstQueryValue(req.query.all).toLowerCase() === "true";
    const limit = parsePositiveInt(firstQueryValue(req.query.limit), includeAll ? 300 : 80, 1, 2000);
    const concurrency = parsePositiveInt(firstQueryValue(req.query.concurrency), 6, 1, 20);
    const robotsUrl = `${frontendUrl}/robots.txt`;
    const sitemapUrl = `${frontendUrl}/sitemap.xml`;
    const manualUrls = normalizeAbsoluteUrlList(config.sitemapManualUrls);
    const excludedUrls = new Set(normalizeAbsoluteUrlList(config.sitemapExcludedUrls));
    let robotsStatus = {
        url: robotsUrl,
        reachable: false,
        httpStatus: null,
        hasAllowAll: false,
        hasSitemapReference: false,
    };
    let sitemapStatus = {
        url: sitemapUrl,
        reachable: false,
        httpStatus: null,
        urlCount: 0,
    };
    const sitemapUrls = [];
    try {
        const { response, body } = await fetchTextWithTimeout(robotsUrl, "text/plain,*/*", SEO_TIMEOUT_MS);
        robotsStatus = {
            ...robotsStatus,
            reachable: response.ok,
            httpStatus: response.status,
            hasAllowAll: /Allow:\s*\/\s*$/im.test(body) || /User-agent:\s*\*\s*[\s\S]*Allow:\s*\//im.test(body),
            hasSitemapReference: /Sitemap:\s*https?:\/\//im.test(body),
        };
    }
    catch (error) {
        robotsStatus = {
            ...robotsStatus,
            error: error instanceof Error ? error.message : "Failed to fetch robots.txt",
        };
    }
    try {
        const { response, body } = await fetchTextWithTimeout(sitemapUrl, "application/xml,text/xml,*/*", SEO_TIMEOUT_MS);
        const urls = response.ok ? extractSitemapUrls(body) : [];
        sitemapUrls.push(...urls);
        sitemapStatus = {
            ...sitemapStatus,
            reachable: response.ok,
            httpStatus: response.status,
            urlCount: urls.length,
            sampleUrls: urls.slice(0, 12),
        };
    }
    catch (error) {
        sitemapStatus = {
            ...sitemapStatus,
            error: error instanceof Error ? error.message : "Failed to fetch sitemap.xml",
        };
    }
    const staticFallbackPages = [
        `${frontendUrl}/`,
        `${frontendUrl}/listings`,
        `${frontendUrl}/articles`,
        `${frontendUrl}/classifieds`,
        `${frontendUrl}/images`,
        `${frontendUrl}/social`,
        `${frontendUrl}/social-bookmarking`,
        `${frontendUrl}/profile`,
        `${frontendUrl}/pdf`,
    ];
    const effectiveUrls = Array.from(new Set([...sitemapUrls, ...manualUrls, ...staticFallbackPages])).filter((url) => /^https?:\/\//i.test(url) && !excludedUrls.has(url));
    const urlsToInspect = (includeAll ? effectiveUrls : effectiveUrls).slice(0, limit);
    const pagesToInspect = urlsToInspect.map((url) => {
        const path = pathFromUrl(url);
        const isArticleDetail = /^\/articles\/[^/]+$/i.test(path);
        return {
            key: path === "/" ? "home" : path,
            path,
            url,
            articleDetail: isArticleDetail,
        };
    });
    const pageReports = [];
    for (let index = 0; index < pagesToInspect.length; index += concurrency) {
        const batch = pagesToInspect.slice(index, index + concurrency);
        const inspectedBatch = await Promise.all(batch.map((page) => inspectPageSeo(page, frontendUrl, blueprint)));
        pageReports.push(...inspectedBatch);
    }
    const totalChecks = pageReports.reduce((sum, item) => {
        const checks = item.checks || {};
        return sum + Object.keys(checks).length;
    }, 0);
    const passedChecks = pageReports.reduce((sum, item) => {
        const checks = item.checks || {};
        return sum + Object.values(checks).filter(Boolean).length;
    }, 0);
    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
    res.json({
        success: true,
        data: {
            siteId: site.id,
            siteCode: site.code,
            siteName: site.name,
            checkedAt,
            score,
            summary: {
                totalChecks,
                passedChecks,
                failedChecks: Math.max(totalChecks - passedChecks, 0),
            },
            robots: robotsStatus,
            sitemap: sitemapStatus,
            crawl: {
                includeAll,
                limit,
                concurrency,
                discoveredUrls: effectiveUrls.length,
                inspectedUrls: pageReports.length,
                isLimited: effectiveUrls.length > pageReports.length,
            },
            pages: pageReports,
            blueprint: blueprint || null,
        },
    });
}));
router.get("/:siteId/link-health", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const frontendUrl = (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
    if (!frontendUrl) {
        throw new api_error_1.ApiError(400, "Site frontend URL is missing. Update site config first.");
    }
    const limit = parsePositiveInt(firstQueryValue(req.query.limit), 120, 1, 1000);
    const maxLinks = parsePositiveInt(firstQueryValue(req.query.maxLinks), 200, 1, 1000);
    const timeoutMs = parsePositiveInt(firstQueryValue(req.query.timeoutMs), 8000, 1000, 30000);
    const concurrency = parsePositiveInt(firstQueryValue(req.query.concurrency), 6, 1, 20);
    const endpointUrl = `${frontendUrl}/api/seo/link-health?limit=${limit}&maxLinks=${maxLinks}&timeoutMs=${timeoutMs}&concurrency=${concurrency}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LINK_HEALTH_TIMEOUT_MS);
    const checkedAt = new Date().toISOString();
    try {
        const response = await fetch(endpointUrl, {
            method: "GET",
            headers: { Accept: "application/json,*/*" },
            cache: "no-store",
            signal: controller.signal,
        });
        const rawText = await response.text();
        let parsed = null;
        if (rawText) {
            try {
                parsed = JSON.parse(rawText);
            }
            catch {
                parsed = null;
            }
        }
        const payload = parsed && typeof parsed === "object" ? parsed : {};
        const data = (payload.data && typeof payload.data === "object"
            ? payload.data
            : null);
        const success = Boolean(payload.success) && response.ok && Boolean(data);
        res.json({
            success: true,
            data: {
                siteId: site.id,
                siteCode: site.code,
                siteName: site.name,
                endpointUrl,
                checkedAt,
                reachable: response.ok,
                httpStatus: response.status,
                success,
                error: success
                    ? null
                    : typeof payload.message === "string"
                        ? payload.message
                        : !response.ok
                            ? `Remote endpoint failed with status ${response.status}`
                            : "Invalid link health payload from site.",
                result: data || null,
            },
        });
        return;
    }
    catch (error) {
        res.json({
            success: true,
            data: {
                siteId: site.id,
                siteCode: site.code,
                siteName: site.name,
                endpointUrl,
                checkedAt,
                reachable: false,
                httpStatus: null,
                success: false,
                error: error instanceof Error ? error.message : "Failed to fetch link health endpoint.",
                result: null,
            },
        });
        return;
    }
    finally {
        clearTimeout(timeout);
    }
}));
router.post("/:siteId/indexing/submit-sitemap", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    let result;
    try {
        result = await (0, google_indexing_1.submitSiteSitemapForIndexing)(site.config);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Sitemap submission failed.";
        await db_1.prisma.site.update({
            where: { id: site.id },
            data: {
                config: {
                    ...config,
                    indexingLastSitemapSubmitAt: new Date().toISOString(),
                    indexingLastSitemapSubmitStatus: "ERROR",
                    indexingLastSitemapSubmitError: message,
                },
            },
        });
        throw new api_error_1.ApiError(400, message);
    }
    if (!result.submitted) {
        const reason = result.reason || "Sitemap could not be submitted.";
        await db_1.prisma.site.update({
            where: { id: site.id },
            data: {
                config: {
                    ...config,
                    indexingLastSitemapSubmitAt: new Date().toISOString(),
                    indexingLastSitemapSubmitStatus: "ERROR",
                    indexingLastSitemapSubmitError: reason,
                },
            },
        });
        throw new api_error_1.ApiError(400, reason);
    }
    await (0, google_indexing_1.updateSitemapSubmissionForSite)(site.id, new Date(result.submittedAt || new Date().toISOString()));
    await db_1.prisma.site.update({
        where: { id: site.id },
        data: {
            config: {
                ...config,
                indexingLastSitemapSubmitAt: result.submittedAt || new Date().toISOString(),
                indexingLastSitemapSubmitStatus: "SUCCESS",
                indexingLastSitemapSubmitError: "",
            },
        },
    });
    res.json({
        success: true,
        data: {
            siteId: site.id,
            siteCode: site.code,
            siteName: site.name,
            ...result,
        },
    });
}));
router.post("/:siteId/indexing/run-inspections", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 100);
    const execution = await (0, google_indexing_1.runDueIndexingInspections)({
        siteId: site.id,
        siteConfig: site.config,
        limit,
    });
    res.json({
        success: true,
        data: {
            siteId: site.id,
            siteCode: site.code,
            siteName: site.name,
            ...execution,
        },
    });
}));
router.get("/:siteId/indexing-status", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const runDue = req.query.runDue === "true";
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 10), 500);
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, name: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    let autoRunResult = null;
    if (runDue) {
        autoRunResult = await (0, google_indexing_1.runDueIndexingInspections)({
            siteId: site.id,
            siteConfig: site.config,
            limit: 20,
        });
    }
    try {
        const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
        const frontendUrl = (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
        if (frontendUrl) {
            const sitemapUrl = `${frontendUrl}/sitemap.xml`;
            const response = await fetch(sitemapUrl, {
                method: "GET",
                headers: { Accept: "application/xml,text/xml,*/*" },
                cache: "no-store",
            });
            if (response.ok) {
                const xml = await response.text();
                const urls = extractSitemapUrls(xml);
                if (urls.length) {
                    const seenAt = new Date();
                    await db_1.prisma.siteIndexingRecord.updateMany({
                        where: {
                            siteId: site.id,
                            url: { in: urls },
                            sitemapSeenAt: null,
                        },
                        data: {
                            sitemapSeenAt: seenAt,
                            sitemapSubmittedAt: seenAt,
                            inspectionStatus: "DISCOVERED",
                        },
                    });
                    await db_1.prisma.siteIndexingRecord.updateMany({
                        where: {
                            siteId: site.id,
                            url: { in: urls },
                            sitemapSubmittedAt: null,
                        },
                        data: {
                            sitemapSubmittedAt: seenAt,
                        },
                    });
                }
            }
        }
    }
    catch (error) {
        console.warn("Failed to sync sitemap seen URLs", error);
    }
    const [records, totalRecords, sitemapSubmittedCount, sitemapSeenCount, discoveredCount, indexedCount, notIndexedCount, errorCount, groupedStatuses, publishedPostsCount,] = await Promise.all([
        db_1.prisma.siteIndexingRecord.findMany({
            where: { siteId: site.id },
            include: {
                post: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        publishedAt: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: [{ updatedAt: "desc" }],
            take: limit,
        }),
        db_1.prisma.siteIndexingRecord.count({ where: { siteId: site.id } }),
        db_1.prisma.siteIndexingRecord.count({
            where: { siteId: site.id, sitemapSubmittedAt: { not: null } },
        }),
        db_1.prisma.siteIndexingRecord.count({
            where: { siteId: site.id, sitemapSeenAt: { not: null } },
        }),
        db_1.prisma.siteIndexingRecord.count({
            where: { siteId: site.id, inspectionStatus: "DISCOVERED" },
        }),
        db_1.prisma.siteIndexingRecord.count({
            where: { siteId: site.id, inspectionStatus: "INDEXED" },
        }),
        db_1.prisma.siteIndexingRecord.count({
            where: { siteId: site.id, inspectionStatus: "NOT_INDEXED" },
        }),
        db_1.prisma.siteIndexingRecord.count({
            where: { siteId: site.id, inspectionStatus: "ERROR" },
        }),
        db_1.prisma.siteIndexingRecord.groupBy({
            by: ["inspectionStatus"],
            where: { siteId: site.id },
            _count: { _all: true },
        }),
        db_1.prisma.post.count({
            where: { siteId: site.id, status: "PUBLISHED" },
        }),
    ]);
    const byStatus = groupedStatuses.reduce((acc, row) => {
        acc[row.inspectionStatus] = row._count._all;
        return acc;
    }, {});
    const trackingCoverage = publishedPostsCount > 0
        ? Math.round((totalRecords / publishedPostsCount) * 100)
        : 0;
    const untrackedPublishedPosts = Math.max(publishedPostsCount - totalRecords, 0);
    const siteConfig = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const summary = {
        total: totalRecords,
        sitemapSubmitted: sitemapSubmittedCount,
        sitemapSeen: sitemapSeenCount,
        discovered: discoveredCount,
        indexed: indexedCount,
        notIndexed: notIndexedCount,
        errors: errorCount,
        byStatus,
    };
    res.json({
        success: true,
        data: {
            site: {
                id: site.id,
                code: site.code,
                name: site.name,
            },
            checkedAt: new Date().toISOString(),
            autoRun: autoRunResult,
            summary,
            diagnostics: {
                publishedPosts: publishedPostsCount,
                trackedPosts: totalRecords,
                untrackedPublishedPosts,
                trackingCoveragePercent: trackingCoverage,
                googleConfigured: Boolean(siteConfig.googleServiceAccountEmail || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
                    Boolean(siteConfig.googleServiceAccountPrivateKey || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) &&
                    Boolean(siteConfig.googleSearchConsoleSiteUrl || siteConfig.searchConsoleSiteUrl || process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || siteConfig.frontendUrl || siteConfig.liveUrl || siteConfig.siteUrl),
                siteProperty: siteConfig.googleSearchConsoleSiteUrl ||
                    siteConfig.searchConsoleSiteUrl ||
                    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ||
                    siteConfig.frontendUrl ||
                    siteConfig.liveUrl ||
                    siteConfig.siteUrl ||
                    null,
                lastSitemapSubmitAt: siteConfig.indexingLastSitemapSubmitAt || null,
                lastSitemapSubmitStatus: siteConfig.indexingLastSitemapSubmitStatus || null,
                lastSitemapSubmitError: siteConfig.indexingLastSitemapSubmitError || null,
                indexNowConfigured: Boolean((0, indexnow_1.getIndexNowConfig)(site.config)),
                indexNowHost: siteConfig.indexNowHost || (0, indexnow_1.getIndexNowConfig)(site.config)?.host || null,
                indexNowEndpoint: siteConfig.indexNowEndpoint || (0, indexnow_1.getIndexNowConfig)(site.config)?.endpoint || null,
                indexNowLastSubmittedAt: siteConfig.indexNowLastSubmittedAt || null,
                indexNowLastSubmittedCount: siteConfig.indexNowLastSubmittedCount || 0,
                indexNowLastStatus: siteConfig.indexNowLastStatus || null,
                indexNowLastError: siteConfig.indexNowLastError || null,
            },
            items: records.map((item) => ({
                id: item.id,
                postId: item.postId,
                postTitle: item.post.title,
                postSlug: item.post.slug,
                url: item.url,
                publishedAt: item.post.publishedAt || item.post.createdAt,
                sitemapUrl: item.sitemapUrl,
                sitemapSubmittedAt: item.sitemapSubmittedAt,
                sitemapSeenAt: item.sitemapSeenAt,
                inspectionStatus: item.inspectionStatus,
                inspectionCoverage: item.inspectionCoverage,
                inspectionVerdict: item.inspectionVerdict,
                inspectionAttempts: item.inspectionAttempts,
                inspectionLastCheckedAt: item.inspectionLastCheckedAt,
                inspectionNextCheckAt: item.inspectionNextCheckAt,
                lastError: item.lastError,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            })),
        },
    });
}));
router.post("/", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { code, name, framework, category, theme, config } = req.body;
    if (!code || !name || !framework || !category) {
        throw new api_error_1.ApiError(400, "code, name, framework and category are required fields.");
    }
    if (!(framework in client_1.SiteFramework)) {
        throw new api_error_1.ApiError(400, "Invalid framework value.");
    }
    const normalizedCategory = normalizeSiteCategory(category);
    if (!normalizedCategory) {
        throw new api_error_1.ApiError(400, "Invalid category value.");
    }
    const sanitizedConfig = (0, site_contract_1.sanitizeSiteConfig)(config);
    const created = await db_1.prisma.site.create({
        data: {
            code,
            name,
            framework,
            category: normalizedCategory,
            theme,
            config: sanitizedConfig,
        },
    });
    const requestedTasks = Array.isArray(sanitizedConfig.supportedTasks)
        ? sanitizedConfig.supportedTasks.filter(site_contract_1.isSiteTask)
        : [];
    const taskPackages = requestedTasks.length
        ? await Promise.all(requestedTasks.map((task) => provisionTaskToken(created, task)))
        : [];
    res.status(201).json({
        success: true,
        data: {
            site: {
                ...created,
                config: (0, site_contract_1.sanitizeSiteConfig)(created.config),
                blueprint: (0, site_contract_1.buildSiteBlueprint)(created.code, created.config, {
                    backendBaseUrl: backendBaseUrl(),
                    includeTaskCatalog: true,
                }),
            },
            provisioning: {
                usage: [
                    "Task tokens are required for posting. Each task has its own API endpoint and payload template.",
                    requestedTasks.length
                        ? `Provisioned ${requestedTasks.length} task token(s) from your selected tasks.`
                        : "Add tasks from the Tasks panel to generate posting tokens.",
                ],
                tasks: taskPackages,
            },
        },
    });
}));
router.post("/:siteId/permissions", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { siteId } = req.params;
    const resolvedSiteId = String(siteId);
    const { apiKeyId, canPost = true, canRead = true } = req.body;
    if (!apiKeyId) {
        throw new api_error_1.ApiError(400, "apiKeyId is required.");
    }
    const permission = await db_1.prisma.apiKeySitePermission.upsert({
        where: { apiKeyId_siteId: { apiKeyId, siteId: resolvedSiteId } },
        update: { canPost, canRead },
        create: { apiKeyId, siteId: resolvedSiteId, canPost, canRead },
    });
    res.status(201).json({ success: true, data: permission });
}));
router.post("/:siteId/tasks", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const task = normalizeTaskValue(req.body.task);
    if (!(0, site_contract_1.isSiteTask)(task)) {
        throw new api_error_1.ApiError(400, "A valid task is required.");
    }
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: {
            id: true,
            code: true,
            name: true,
            framework: true,
            category: true,
            theme: true,
            config: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
        },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const nextConfig = {
        ...config,
        supportedTasks: Array.from(new Set([...(config.supportedTasks || []), task])),
    };
    const updated = await db_1.prisma.site.update({
        where: { id: siteId },
        data: { config: nextConfig },
    });
    const taskPackage = await provisionTaskToken(site, task);
    res.status(201).json({
        success: true,
        data: {
            site: {
                ...updated,
                config: (0, site_contract_1.sanitizeSiteConfig)(updated.config),
                blueprint: (0, site_contract_1.buildSiteBlueprint)(updated.code, updated.config, {
                    backendBaseUrl: backendBaseUrl(),
                    includeTaskCatalog: true,
                }),
            },
            task: {
                ...taskPackage,
            },
        },
    });
}));
router.post("/:siteId/tasks/:task/issue", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const task = normalizeTaskValue(req.params.task);
    if (!(0, site_contract_1.isSiteTask)(task)) {
        throw new api_error_1.ApiError(400, "A valid task is required.");
    }
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: {
            id: true,
            code: true,
            name: true,
            framework: true,
            category: true,
            theme: true,
            config: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
        },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const nextConfig = {
        ...config,
        supportedTasks: Array.from(new Set([...(config.supportedTasks || []), task])),
    };
    const updated = await db_1.prisma.site.update({
        where: { id: siteId },
        data: { config: nextConfig },
    });
    const taskPackage = await provisionTaskToken(site, task);
    res.status(201).json({
        success: true,
        data: {
            site: {
                ...updated,
                config: (0, site_contract_1.sanitizeSiteConfig)(updated.config),
                blueprint: (0, site_contract_1.buildSiteBlueprint)(updated.code, updated.config, {
                    backendBaseUrl: backendBaseUrl(),
                    includeTaskCatalog: true,
                }),
            },
            task: {
                ...taskPackage,
            },
        },
    });
}));
router.delete("/:siteId/tasks/:task", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const task = normalizeTaskValue(req.params.task);
    if (!(0, site_contract_1.isSiteTask)(task)) {
        throw new api_error_1.ApiError(400, "A valid task is required.");
    }
    const site = await db_1.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, code: true, config: true },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const nextConfig = {
        ...config,
        supportedTasks: (config.supportedTasks || []).filter((item) => item !== task),
    };
    const updated = await db_1.prisma.site.update({
        where: { id: siteId },
        data: { config: nextConfig },
    });
    const taskScope = `task:${task}`;
    const keys = await db_1.prisma.apiKey.findMany({
        where: {
            scopes: { has: taskScope },
            permissions: { some: { siteId } },
        },
        select: { id: true },
    });
    const keyIds = keys.map((key) => key.id);
    if (keyIds.length > 0) {
        await db_1.prisma.apiKey.updateMany({
            where: { id: { in: keyIds } },
            data: { isActive: false },
        });
        await db_1.prisma.apiKeySitePermission.deleteMany({
            where: { siteId, apiKeyId: { in: keyIds } },
        });
    }
    res.json({
        success: true,
        data: {
            site: {
                ...updated,
                config: (0, site_contract_1.sanitizeSiteConfig)(updated.config),
                blueprint: (0, site_contract_1.buildSiteBlueprint)(updated.code, updated.config, {
                    backendBaseUrl: backendBaseUrl(),
                    includeTaskCatalog: true,
                }),
            },
            task,
            revokedKeys: keyIds.length,
        },
    });
}));
router.patch("/:siteId/archive", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const site = await db_1.prisma.site.update({
        where: { id: String(req.params.siteId) },
        data: { isActive: false },
    });
    res.json({ success: true, data: site });
}));
router.patch("/:siteId", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const { name, framework, category, theme, config, isActive } = req.body;
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (theme !== undefined)
        updateData.theme = theme;
    if (config !== undefined)
        updateData.config = (0, site_contract_1.sanitizeSiteConfig)(config);
    if (isActive !== undefined)
        updateData.isActive = Boolean(isActive);
    if (framework !== undefined) {
        if (!(framework in client_1.SiteFramework)) {
            throw new api_error_1.ApiError(400, "Invalid framework value.");
        }
        updateData.framework = framework;
    }
    if (category !== undefined) {
        const normalizedCategory = normalizeSiteCategory(category);
        if (!normalizedCategory) {
            throw new api_error_1.ApiError(400, "Invalid category value.");
        }
        updateData.category = normalizedCategory;
    }
    const site = await db_1.prisma.site.update({
        where: { id: siteId },
        data: updateData,
    });
    res.json({
        success: true,
        data: {
            ...site,
            config: (0, site_contract_1.sanitizeSiteConfig)(site.config),
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config, {
                backendBaseUrl: backendBaseUrl(),
                includeTaskCatalog: true,
            }),
        },
    });
}));
router.get("/:siteId/blueprint", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const site = await db_1.prisma.site.findUnique({
        where: { id: String(req.params.siteId) },
        select: {
            id: true,
            code: true,
            name: true,
            framework: true,
            category: true,
            config: true,
        },
    });
    if (!site) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    res.json({
        success: true,
        data: {
            site: {
                ...site,
                config,
            },
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config, {
                backendBaseUrl: backendBaseUrl(),
                includeTaskCatalog: true,
            }),
            integrationSteps: [
                "Set backend URL and site code in the frontend environment.",
                "Use the public bootstrap endpoint to hydrate site metadata and supported tasks.",
                "Use the public feed endpoint for server-rendered content pages.",
                "Use a task-specific API key from the admin panel for post creation and automation tools.",
            ],
        },
    });
}));
router.delete("/:siteId", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    await db_1.prisma.site.delete({ where: { id: siteId } });
    res.json({ success: true, message: "Site deleted." });
}));
exports.default = router;
