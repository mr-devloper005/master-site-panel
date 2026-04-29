"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSiteBlueprint = exports.getSiteFrontendBaseUrl = exports.sanitizeSiteConfig = exports.normalizeBaseUrl = exports.isSiteTask = exports.DEFAULT_CONNECTOR_VERSION = exports.SITE_TASKS = void 0;
const task_catalog_1 = require("./task-catalog");
exports.SITE_TASKS = [
    "listing",
    "article",
    "image",
    "mediaDistribution",
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
    const sanitizePositiveNumber = (input, min, max) => {
        const parsed = Number(input);
        if (!Number.isFinite(parsed))
            return undefined;
        const value = Math.floor(parsed);
        if (value < min || value > max)
            return undefined;
        return value;
    };
    const indexNowEnabled = typeof source.indexNowEnabled === "boolean" ? source.indexNowEnabled : undefined;
    const indexNowHost = sanitizeString(source.indexNowHost, 255);
    const indexNowKey = sanitizeString(source.indexNowKey, 255);
    const indexNowKeyLocation = sanitizeString(source.indexNowKeyLocation, 500);
    const indexNowEndpoint = sanitizeString(source.indexNowEndpoint, 500);
    const indexNowLastSubmittedAt = sanitizeString(source.indexNowLastSubmittedAt, 100);
    const indexNowLastStatus = source.indexNowLastStatus === "SUCCESS" || source.indexNowLastStatus === "ERROR"
        ? source.indexNowLastStatus
        : undefined;
    const indexNowLastError = sanitizeString(source.indexNowLastError, 1000);
    const indexNowLastSubmittedCount = sanitizePositiveNumber(source.indexNowLastSubmittedCount, 0, 100000);
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
    const rawSeoBlueprint = source.seoBlueprint && typeof source.seoBlueprint === "object" && !Array.isArray(source.seoBlueprint)
        ? source.seoBlueprint
        : {};
    const rawUrlStructure = rawSeoBlueprint.urlStructure &&
        typeof rawSeoBlueprint.urlStructure === "object" &&
        !Array.isArray(rawSeoBlueprint.urlStructure)
        ? rawSeoBlueprint.urlStructure
        : {};
    const rawHeadingPolicy = rawSeoBlueprint.headingPolicy &&
        typeof rawSeoBlueprint.headingPolicy === "object" &&
        !Array.isArray(rawSeoBlueprint.headingPolicy)
        ? rawSeoBlueprint.headingPolicy
        : {};
    const rawImagePolicy = rawSeoBlueprint.imagePolicy &&
        typeof rawSeoBlueprint.imagePolicy === "object" &&
        !Array.isArray(rawSeoBlueprint.imagePolicy)
        ? rawSeoBlueprint.imagePolicy
        : {};
    const rawInternalLinkPolicy = rawSeoBlueprint.internalLinkPolicy &&
        typeof rawSeoBlueprint.internalLinkPolicy === "object" &&
        !Array.isArray(rawSeoBlueprint.internalLinkPolicy)
        ? rawSeoBlueprint.internalLinkPolicy
        : {};
    const rawSchemaPolicy = rawSeoBlueprint.schemaPolicy &&
        typeof rawSeoBlueprint.schemaPolicy === "object" &&
        !Array.isArray(rawSeoBlueprint.schemaPolicy)
        ? rawSeoBlueprint.schemaPolicy
        : {};
    const rawDefaultsPolicy = rawSeoBlueprint.defaults &&
        typeof rawSeoBlueprint.defaults === "object" &&
        !Array.isArray(rawSeoBlueprint.defaults)
        ? rawSeoBlueprint.defaults
        : {};
    const sanitizeSchemaTypes = (input) => {
        if (!Array.isArray(input))
            return [];
        const allow = new Set([
            "Organization",
            "WebSite",
            "Article",
            "BreadcrumbList",
            "LocalBusiness",
            "ImageObject",
            "CollectionPage",
            "ItemList",
        ]);
        return Array.from(new Set(input
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => allow.has(item))));
    };
    const rawPageTemplates = rawSeoBlueprint.pageTemplates &&
        typeof rawSeoBlueprint.pageTemplates === "object" &&
        !Array.isArray(rawSeoBlueprint.pageTemplates)
        ? rawSeoBlueprint.pageTemplates
        : {};
    const pageTemplates = Object.fromEntries(Object.entries(rawPageTemplates)
        .filter(([path, template]) => {
        if (typeof path !== "string" || !path.trim())
            return false;
        return Boolean(template && typeof template === "object" && !Array.isArray(template));
    })
        .map(([path, template]) => {
        const value = template;
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        return [
            normalizedPath,
            {
                titleTemplate: sanitizeString(value.titleTemplate, 180),
                descriptionTemplate: sanitizeString(value.descriptionTemplate, 400),
                h1Template: sanitizeString(value.h1Template, 180),
                canonical: sanitizeString(value.canonical, 500),
                schemaTypes: sanitizeSchemaTypes(value.schemaTypes),
                minInternalLinks: sanitizePositiveNumber(value.minInternalLinks, 0, 200),
                imageAltTemplate: sanitizeString(value.imageAltTemplate, 220),
                robotsIndex: typeof value.robotsIndex === "boolean" ? value.robotsIndex : undefined,
                robotsFollow: typeof value.robotsFollow === "boolean" ? value.robotsFollow : undefined,
            },
        ];
    })
        .slice(0, 120));
    const seoBlueprint = {
        urlStructure: {
            enforceLowercase: typeof rawUrlStructure.enforceLowercase === "boolean" ? rawUrlStructure.enforceLowercase : undefined,
            enforceHyphenatedSlugs: typeof rawUrlStructure.enforceHyphenatedSlugs === "boolean"
                ? rawUrlStructure.enforceHyphenatedSlugs
                : undefined,
            maxSlugLength: sanitizePositiveNumber(rawUrlStructure.maxSlugLength, 20, 220),
        },
        headingPolicy: {
            requireSingleH1: typeof rawHeadingPolicy.requireSingleH1 === "boolean" ? rawHeadingPolicy.requireSingleH1 : undefined,
            minH2Count: sanitizePositiveNumber(rawHeadingPolicy.minH2Count, 0, 40),
            allowH3Plus: typeof rawHeadingPolicy.allowH3Plus === "boolean" ? rawHeadingPolicy.allowH3Plus : undefined,
        },
        imagePolicy: {
            requireAltText: typeof rawImagePolicy.requireAltText === "boolean" ? rawImagePolicy.requireAltText : undefined,
            minAltLength: sanitizePositiveNumber(rawImagePolicy.minAltLength, 0, 160),
            enforceLazyLoading: typeof rawImagePolicy.enforceLazyLoading === "boolean"
                ? rawImagePolicy.enforceLazyLoading
                : undefined,
            enforceWidthHeight: typeof rawImagePolicy.enforceWidthHeight === "boolean"
                ? rawImagePolicy.enforceWidthHeight
                : undefined,
        },
        internalLinkPolicy: {
            minInternalLinksPerPage: sanitizePositiveNumber(rawInternalLinkPolicy.minInternalLinksPerPage, 0, 50),
            descriptiveAnchorMinWords: sanitizePositiveNumber(rawInternalLinkPolicy.descriptiveAnchorMinWords, 1, 12),
            enforceRelatedBlock: typeof rawInternalLinkPolicy.enforceRelatedBlock === "boolean"
                ? rawInternalLinkPolicy.enforceRelatedBlock
                : undefined,
        },
        schemaPolicy: {
            enabledTypes: sanitizeSchemaTypes(rawSchemaPolicy.enabledTypes),
            requireBreadcrumbOnDetail: typeof rawSchemaPolicy.requireBreadcrumbOnDetail === "boolean"
                ? rawSchemaPolicy.requireBreadcrumbOnDetail
                : undefined,
            requireArticleSchemaOnArticles: typeof rawSchemaPolicy.requireArticleSchemaOnArticles === "boolean"
                ? rawSchemaPolicy.requireArticleSchemaOnArticles
                : undefined,
            requireImageObjectForImagePosts: typeof rawSchemaPolicy.requireImageObjectForImagePosts === "boolean"
                ? rawSchemaPolicy.requireImageObjectForImagePosts
                : undefined,
        },
        defaults: {
            robotsIndex: typeof rawDefaultsPolicy.robotsIndex === "boolean" ? rawDefaultsPolicy.robotsIndex : undefined,
            robotsFollow: typeof rawDefaultsPolicy.robotsFollow === "boolean" ? rawDefaultsPolicy.robotsFollow : undefined,
            hreflangDefault: sanitizeString(rawDefaultsPolicy.hreflangDefault, 16),
            authorFallback: sanitizeString(rawDefaultsPolicy.authorFallback, 100),
        },
        pageTemplates,
    };
    const hasBlueprint = Object.keys(pageTemplates || {}).length > 0 ||
        Object.values(seoBlueprint.urlStructure || {}).some((value) => value !== undefined) ||
        Object.values(seoBlueprint.headingPolicy || {}).some((value) => value !== undefined) ||
        Object.values(seoBlueprint.imagePolicy || {}).some((value) => value !== undefined) ||
        Object.values(seoBlueprint.internalLinkPolicy || {}).some((value) => value !== undefined) ||
        Object.values(seoBlueprint.defaults || {}).some((value) => value !== undefined) ||
        (Array.isArray(seoBlueprint.schemaPolicy?.enabledTypes) &&
            seoBlueprint.schemaPolicy?.enabledTypes.length > 0) ||
        typeof seoBlueprint.schemaPolicy?.requireBreadcrumbOnDetail === "boolean" ||
        typeof seoBlueprint.schemaPolicy?.requireArticleSchemaOnArticles === "boolean" ||
        typeof seoBlueprint.schemaPolicy?.requireImageObjectForImagePosts === "boolean";
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
        indexNowEnabled,
        indexNowHost,
        indexNowKey,
        indexNowKeyLocation,
        indexNowEndpoint,
        indexNowLastSubmittedAt,
        indexNowLastSubmittedCount,
        indexNowLastStatus,
        indexNowLastError,
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
        seoBlueprint: hasBlueprint ? seoBlueprint : undefined,
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
