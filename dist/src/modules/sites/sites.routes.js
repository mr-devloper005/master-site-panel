"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const async_handler_1 = require("../../utils/async-handler");
const runtime_store_1 = require("../runtime/runtime-store");
const site_contract_1 = require("./site-contract");
const router = (0, express_1.Router)();
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
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config),
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
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config),
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
    const created = await db_1.prisma.site.create({
        data: {
            code,
            name,
            framework,
            category,
            theme,
            config: (0, site_contract_1.sanitizeSiteConfig)(config),
        },
    });
    res.status(201).json({
        success: true,
        data: {
            ...created,
            config: (0, site_contract_1.sanitizeSiteConfig)(created.config),
            blueprint: (0, site_contract_1.buildSiteBlueprint)(created.code, created.config),
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
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config),
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
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config),
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
