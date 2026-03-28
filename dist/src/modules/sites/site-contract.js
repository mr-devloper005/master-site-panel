"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSiteBlueprint = exports.getSiteFrontendBaseUrl = exports.sanitizeSiteConfig = exports.normalizeBaseUrl = exports.isSiteTask = exports.DEFAULT_CONNECTOR_VERSION = exports.SITE_TASKS = void 0;
const task_catalog_1 = require("./task-catalog");
exports.SITE_TASKS = [
    "listing",
    "article",
    "image",
    "profile",
    "classified",
    "social",
    "sbm",
    "comment",
    "pdf",
    "org",
];
exports.DEFAULT_CONNECTOR_VERSION = "2026-03-connector-v1";
const isSiteTask = (value) => typeof value === "string" && exports.SITE_TASKS.includes(value);
exports.isSiteTask = isSiteTask;
const normalizeBaseUrl = (value) => {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    return trimmed.replace(/\/+$/, "");
};
exports.normalizeBaseUrl = normalizeBaseUrl;
const sanitizeSiteConfig = (value) => {
    const source = value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    const supportedTasks = Array.isArray(source.supportedTasks)
        ? source.supportedTasks.filter(exports.isSiteTask)
        : [];
    const taskViews = Object.fromEntries(Object.entries(source.taskViews && typeof source.taskViews === "object" && !Array.isArray(source.taskViews)
        ? source.taskViews
        : {}).filter(([task, path]) => (0, exports.isSiteTask)(task) && typeof path === "string" && path.trim()));
    const metrics = Array.isArray(source.metrics)
        ? source.metrics.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];
    const sitemapManualUrls = Array.isArray(source.sitemapManualUrls)
        ? source.sitemapManualUrls
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => Boolean(item) && /^https?:\/\//i.test(item))
        : [];
    const sitemapExcludedUrls = Array.isArray(source.sitemapExcludedUrls)
        ? source.sitemapExcludedUrls
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => Boolean(item) && /^https?:\/\//i.test(item))
        : [];
    const sanitizeString = (input, maxLength = 500) => {
        if (typeof input !== "string")
            return undefined;
        const value = input.trim();
        if (!value)
            return undefined;
        return value.slice(0, maxLength);
    };
    const sanitizeKeywords = (input) => {
        if (!Array.isArray(input))
            return [];
        return Array.from(new Set(input
            .filter((item) => typeof item === "string")
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 40)));
    };
    const rawSeoDefaults = source.seoDefaults && typeof source.seoDefaults === "object" && !Array.isArray(source.seoDefaults)
        ? source.seoDefaults
        : {};
    const seoDefaults = {
        defaultTitle: sanitizeString(rawSeoDefaults.defaultTitle, 120),
        titleTemplate: sanitizeString(rawSeoDefaults.titleTemplate, 120),
        defaultDescription: sanitizeString(rawSeoDefaults.defaultDescription, 320),
        defaultOgImage: sanitizeString(rawSeoDefaults.defaultOgImage, 500),
        keywords: sanitizeKeywords(rawSeoDefaults.keywords),
    };
    const rawSeoPages = source.seoPages && typeof source.seoPages === "object" && !Array.isArray(source.seoPages)
        ? source.seoPages
        : {};
    const seoPages = Object.fromEntries(Object.entries(rawSeoPages)
        .filter(([path, pageConfig]) => {
        if (typeof path !== "string" || !path.trim())
            return false;
        return Boolean(pageConfig && typeof pageConfig === "object" && !Array.isArray(pageConfig));
    })
        .map(([path, pageConfig]) => {
        const config = pageConfig;
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        return [
            normalizedPath,
            {
                title: sanitizeString(config.title, 120),
                description: sanitizeString(config.description, 320),
                canonical: sanitizeString(config.canonical, 500),
                ogImage: sanitizeString(config.ogImage, 500),
                keywords: sanitizeKeywords(config.keywords),
                robotsIndex: typeof config.robotsIndex === "boolean" ? config.robotsIndex : undefined,
                robotsFollow: typeof config.robotsFollow === "boolean" ? config.robotsFollow : undefined,
            },
        ];
    })
        .slice(0, 80));
    const hasSeoDefaults = Boolean(seoDefaults.defaultTitle ||
        seoDefaults.titleTemplate ||
        seoDefaults.defaultDescription ||
        seoDefaults.defaultOgImage ||
        (seoDefaults.keywords && seoDefaults.keywords.length));
    const hasSeoPages = Boolean(seoPages && Object.keys(seoPages).length);
    return {
        frontendUrl: (0, exports.normalizeBaseUrl)(source.frontendUrl) || undefined,
        liveUrl: (0, exports.normalizeBaseUrl)(source.liveUrl) || undefined,
        siteUrl: (0, exports.normalizeBaseUrl)(source.siteUrl) || undefined,
        searchConsoleSiteUrl: typeof source.searchConsoleSiteUrl === "string" ? source.searchConsoleSiteUrl : undefined,
        googleSearchConsoleSiteUrl: typeof source.googleSearchConsoleSiteUrl === "string"
            ? source.googleSearchConsoleSiteUrl
            : undefined,
        googleServiceAccountEmail: typeof source.googleServiceAccountEmail === "string"
            ? source.googleServiceAccountEmail
            : undefined,
        googleServiceAccountPrivateKey: typeof source.googleServiceAccountPrivateKey === "string"
            ? source.googleServiceAccountPrivateKey
            : undefined,
        siteType: typeof source.siteType === "string" ? source.siteType : undefined,
        feedPath: typeof source.feedPath === "string" ? source.feedPath : undefined,
        bootstrapPath: typeof source.bootstrapPath === "string" ? source.bootstrapPath : undefined,
        sitemapManualUrls,
        sitemapExcludedUrls,
        indexingLastSitemapSubmitAt: typeof source.indexingLastSitemapSubmitAt === "string"
            ? source.indexingLastSitemapSubmitAt
            : undefined,
        indexingLastSitemapSubmitStatus: source.indexingLastSitemapSubmitStatus === "SUCCESS" ||
            source.indexingLastSitemapSubmitStatus === "ERROR"
            ? source.indexingLastSitemapSubmitStatus
            : undefined,
        indexingLastSitemapSubmitError: typeof source.indexingLastSitemapSubmitError === "string"
            ? source.indexingLastSitemapSubmitError
            : undefined,
        connectorVersion: typeof source.connectorVersion === "string" && source.connectorVersion.trim()
            ? source.connectorVersion
            : exports.DEFAULT_CONNECTOR_VERSION,
        supportedTasks,
        taskViews,
        metrics,
        description: typeof source.description === "string" ? source.description : undefined,
        seoDefaults: hasSeoDefaults ? seoDefaults : undefined,
        seoPages: hasSeoPages ? seoPages : undefined,
        seoUpdatedAt: sanitizeString(source.seoUpdatedAt, 64),
    };
};
exports.sanitizeSiteConfig = sanitizeSiteConfig;
const getSiteFrontendBaseUrl = (siteConfig) => {
    const config = (0, exports.sanitizeSiteConfig)(siteConfig);
    return config.frontendUrl || config.liveUrl || config.siteUrl || null;
};
exports.getSiteFrontendBaseUrl = getSiteFrontendBaseUrl;
const buildSiteBlueprint = (siteCode, siteConfig, options) => {
    const config = (0, exports.sanitizeSiteConfig)(siteConfig);
    return {
        connectorVersion: config.connectorVersion || exports.DEFAULT_CONNECTOR_VERSION,
        supportedTasks: config.supportedTasks || [],
        endpoints: {
            bootstrap: `/api/v1/public/${siteCode}/bootstrap`,
            feed: `/api/v1/public/${siteCode}/feed`,
        },
        frontend: {
            baseUrl: (0, exports.getSiteFrontendBaseUrl)(siteConfig),
            siteType: config.siteType || "generic",
            taskViews: config.taskViews || {},
            metrics: config.metrics || [],
        },
        ...(options?.includeTaskCatalog
            ? {
                taskCatalog: (0, task_catalog_1.buildTaskCatalog)(siteCode, options.backendBaseUrl),
            }
            : {}),
    };
};
exports.buildSiteBlueprint = buildSiteBlueprint;
