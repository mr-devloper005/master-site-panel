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
const site_contract_1 = require("./site-contract");
const router = (0, express_1.Router)();
const backendBaseUrl = () => (0, base_url_1.getBaseUrl)();
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
