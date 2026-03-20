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
    return {
        frontendUrl: (0, exports.normalizeBaseUrl)(source.frontendUrl) || undefined,
        liveUrl: (0, exports.normalizeBaseUrl)(source.liveUrl) || undefined,
        siteUrl: (0, exports.normalizeBaseUrl)(source.siteUrl) || undefined,
        siteType: typeof source.siteType === "string" ? source.siteType : undefined,
        feedPath: typeof source.feedPath === "string" ? source.feedPath : undefined,
        bootstrapPath: typeof source.bootstrapPath === "string" ? source.bootstrapPath : undefined,
        connectorVersion: typeof source.connectorVersion === "string" && source.connectorVersion.trim()
            ? source.connectorVersion
            : exports.DEFAULT_CONNECTOR_VERSION,
        supportedTasks,
        taskViews,
        metrics,
        description: typeof source.description === "string" ? source.description : undefined,
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
