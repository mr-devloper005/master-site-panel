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
const site_contract_1 = require("./site-contract");
const router = (0, express_1.Router)();
const backendBaseUrl = () => (0, base_url_1.getBaseUrl)();
const SITEMAP_TIMEOUT_MS = 8000;
const SEO_TIMEOUT_MS = 9000;
const normalizeTaskValue = (value) => {
    const raw = Array.isArray(value) ? value[0] : value;
    const normalized = String(raw || "").trim().toLowerCase();
    if (normalized === "blog-commenting" || normalized === "blog_commenting") {
        return "comment";
    }
    return normalized;
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
const hasTag = (html, pattern) => pattern.test(html);
const inspectSeoTags = (html, options) => {
    const checks = {
        metaDescription: hasTag(html, /<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i),
        canonical: hasTag(html, /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]*href=["'][^"']+["'][^>]*>/i),
        robotsMeta: hasTag(html, /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*(index|follow)[^"']*["'][^>]*>/i),
        viewport: hasTag(html, /<meta[^>]+name=["']viewport["'][^>]*content=["'][^"']+["'][^>]*>/i),
        ogTitle: hasTag(html, /<meta[^>]+property=["']og:title["'][^>]*content=["'][^"']+["'][^>]*>/i),
        ogDescription: hasTag(html, /<meta[^>]+property=["']og:description["'][^>]*content=["'][^"']+["'][^>]*>/i),
        ogImage: hasTag(html, /<meta[^>]+property=["']og:image["'][^>]*content=["'][^"']+["'][^>]*>/i),
        ogUrl: hasTag(html, /<meta[^>]+property=["']og:url["'][^>]*content=["'][^"']+["'][^>]*>/i),
        twitterCard: hasTag(html, /<meta[^>]+name=["']twitter:card["'][^>]*content=["'][^"']+["'][^>]*>/i),
        jsonLd: hasTag(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i),
        h1: hasTag(html, /<h1[^>]*>[\s\S]*?<\/h1>/i),
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
    return { checks, missing };
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
    if (category && category in client_1.SiteCategory) {
        where.category = category;
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
    if (!frontendUrl) {
        throw new api_error_1.ApiError(400, "Site frontend URL is missing. Update site config first.");
    }
    const sitemapUrl = `${frontendUrl}/sitemap.xml`;
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
        const mismatched = siteHost
            ? urls.filter((url) => parseHost(url) && parseHost(url) !== siteHost)
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
                urlCount: urls.length,
                sampleUrls: urls.slice(0, 12),
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
    const frontendUrl = (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
    if (!frontendUrl) {
        throw new api_error_1.ApiError(400, "Site frontend URL is missing. Update site config first.");
    }
    const checkedAt = new Date().toISOString();
    const robotsUrl = `${frontendUrl}/robots.txt`;
    const sitemapUrl = `${frontendUrl}/sitemap.xml`;
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
    const pageReports = [];
    let articleDetailUrl = null;
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
        articleDetailUrl = urls.find((url) => /\/articles\/[^/]+$/i.test(url)) || null;
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
    const pagesToInspect = [
        { key: "home", url: `${frontendUrl}/` },
        { key: "articles", url: `${frontendUrl}/articles` },
    ];
    if (articleDetailUrl) {
        pagesToInspect.push({ key: "articleDetail", url: articleDetailUrl, articleDetail: true });
    }
    for (const page of pagesToInspect) {
        try {
            const { response, body } = await fetchTextWithTimeout(page.url, "text/html,*/*", SEO_TIMEOUT_MS);
            if (!response.ok) {
                pageReports.push({
                    page: page.key,
                    url: page.url,
                    reachable: false,
                    httpStatus: response.status,
                    checks: {},
                    missing: [],
                });
                continue;
            }
            const inspected = inspectSeoTags(body, { articleDetail: page.articleDetail });
            pageReports.push({
                page: page.key,
                url: page.url,
                reachable: true,
                httpStatus: response.status,
                checks: inspected.checks,
                missing: inspected.missing,
            });
        }
        catch (error) {
            pageReports.push({
                page: page.key,
                url: page.url,
                reachable: false,
                httpStatus: null,
                checks: {},
                missing: [],
                error: error instanceof Error ? error.message : "Failed to fetch page",
            });
        }
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
            pages: pageReports,
        },
    });
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
    const result = await (0, google_indexing_1.submitSiteSitemapForIndexing)(site.config);
    if (!result.submitted) {
        throw new api_error_1.ApiError(400, result.reason || "Sitemap could not be submitted.");
    }
    await (0, google_indexing_1.updateSitemapSubmissionForSite)(site.id, new Date(result.submittedAt || new Date().toISOString()));
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
                    await db_1.prisma.siteIndexingRecord.updateMany({
                        where: {
                            siteId: site.id,
                            url: { in: urls },
                            sitemapSeenAt: null,
                        },
                        data: {
                            sitemapSeenAt: new Date(),
                            inspectionStatus: "DISCOVERED",
                        },
                    });
                }
            }
        }
    }
    catch (error) {
        console.warn("Failed to sync sitemap seen URLs", error);
    }
    const records = await db_1.prisma.siteIndexingRecord.findMany({
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
    });
    const summary = records.reduce((acc, item) => {
        const key = item.inspectionStatus;
        acc.total += 1;
        acc.byStatus[key] = (acc.byStatus[key] || 0) + 1;
        if (item.sitemapSubmittedAt)
            acc.sitemapSubmitted += 1;
        if (item.sitemapSeenAt)
            acc.discovered += 1;
        if (item.inspectionStatus === "INDEXED")
            acc.indexed += 1;
        return acc;
    }, {
        total: 0,
        sitemapSubmitted: 0,
        discovered: 0,
        indexed: 0,
        byStatus: {},
    });
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
    if (!(category in client_1.SiteCategory)) {
        throw new api_error_1.ApiError(400, "Invalid category value.");
    }
    const sanitizedConfig = (0, site_contract_1.sanitizeSiteConfig)(config);
    const created = await db_1.prisma.site.create({
        data: {
            code,
            name,
            framework,
            category,
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
        if (!(category in client_1.SiteCategory)) {
            throw new api_error_1.ApiError(400, "Invalid category value.");
        }
        updateData.category = category;
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
