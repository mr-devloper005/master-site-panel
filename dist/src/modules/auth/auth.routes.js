"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const async_handler_1 = require("../../utils/async-handler");
const site_contract_1 = require("../sites/site-contract");
const api_key_service_1 = require("./api-key-service");
const router = (0, express_1.Router)();
const TASK_LABELS = {
    listing: "Listing",
    article: "Article",
    image: "Image",
    mediaDistribution: "Media Distribution",
    profile: "Profile",
    classified: "Classified",
    social: "Social",
    sbm: "SBM",
    comment: "Comment",
    pdf: "PDF",
    org: "Organization",
};
const normalizeTaskValue = (value) => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw)
        return null;
    const normalized = raw.trim().toLowerCase();
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
router.get("/integration", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey) {
        throw new api_error_1.ApiError(401, "API key context missing.");
    }
    res.json({
        success: true,
        data: {
            keyId: apiKey.id,
            name: apiKey.name,
            scopes: apiKey.scopes,
            capabilities: {
                canReadSites: apiKey.scopes.includes("*") || apiKey.scopes.includes("sites:read"),
                canWriteSites: apiKey.scopes.includes("*") || apiKey.scopes.includes("sites:write"),
                canReadPosts: apiKey.scopes.includes("*") || apiKey.scopes.includes("posts:read"),
                canWritePosts: apiKey.scopes.includes("*") || apiKey.scopes.includes("posts:write"),
                canManageKeys: apiKey.scopes.includes("*") || apiKey.scopes.includes("keys:write"),
                isSiteMaster: apiKey.scopes.includes("*") ||
                    apiKey.scopes.includes("site:master"),
            },
        },
    });
}));
router.get("/keys", (0, auth_1.requireApiKey)("keys:write"), (0, async_handler_1.asyncHandler)(async (_req, res) => {
    const keys = await db_1.prisma.apiKey.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            permissions: {
                include: {
                    site: {
                        select: {
                            id: true,
                            code: true,
                            name: true,
                        },
                    },
                },
            },
        },
    });
    res.json({
        success: true,
        data: keys.map((key) => ({
            id: key.id,
            name: key.name,
            scopes: key.scopes,
            task: (0, api_key_service_1.inferTask)(key.scopes),
            isActive: key.isActive,
            lastUsedAt: key.lastUsedAt,
            createdAt: key.createdAt,
            sitePermissions: key.permissions.map((permission) => ({
                siteId: permission.siteId,
                siteCode: permission.site.code,
                siteName: permission.site.name,
                canPost: permission.canPost,
                canRead: permission.canRead,
            })),
        })),
    });
}));
router.get("/keys/export-task-tokens", (0, auth_1.requireApiKey)("keys:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const rotateMissing = String(req.query.rotateMissing || "false").toLowerCase() === "true";
    const reissueAll = String(req.query.reissueAll || "false").toLowerCase() === "true";
    const rawTaskQuery = req.query.task;
    const requestedTask = typeof rawTaskQuery === "string"
        ? normalizeTaskValue(rawTaskQuery)
        : Array.isArray(rawTaskQuery)
            ? normalizeTaskValue(rawTaskQuery.filter((item) => typeof item === "string"))
            : null;
    const taskFilter = requestedTask && (0, site_contract_1.isSiteTask)(requestedTask) ? requestedTask : null;
    const addedAfterRaw = Array.isArray(req.query.addedAfter) ? req.query.addedAfter[0] : req.query.addedAfter;
    const addedAfter = typeof addedAfterRaw === "string" && addedAfterRaw.trim()
        ? new Date(addedAfterRaw)
        : null;
    const [sites, keys] = await Promise.all([
        db_1.prisma.site.findMany({
            where: addedAfter && !Number.isNaN(addedAfter.getTime())
                ? { createdAt: { gte: addedAfter } }
                : undefined,
            orderBy: [{ name: "asc" }],
            select: {
                id: true,
                code: true,
                name: true,
                config: true,
                createdAt: true,
            },
        }),
        db_1.prisma.apiKey.findMany({
            where: { isActive: true },
            orderBy: [{ createdAt: "desc" }],
            include: {
                permissions: {
                    include: {
                        site: {
                            select: {
                                id: true,
                                code: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        }),
    ]);
    const keyMap = new Map();
    for (const key of keys) {
        const task = (0, api_key_service_1.inferTask)(key.scopes);
        if (!(0, site_contract_1.isSiteTask)(task))
            continue;
        for (const permission of key.permissions) {
            const mapKey = `${permission.siteId}:${task}`;
            if (!keyMap.has(mapKey)) {
                keyMap.set(mapKey, key);
            }
        }
    }
    const exportRows = [];
    const rotatedRows = [];
    for (const site of sites) {
        const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
        const supportedTasks = Array.isArray(config.supportedTasks)
            ? config.supportedTasks.filter(site_contract_1.isSiteTask)
            : [];
        for (const task of supportedTasks) {
            if (taskFilter && task !== taskFilter)
                continue;
            const mapKey = `${site.id}:${task}`;
            let key = keyMap.get(mapKey) || null;
            let token = key ? (0, api_key_service_1.decryptApiKeyToken)(key.rawTokenCipher) : null;
            if (reissueAll || ((!key || !token) && rotateMissing)) {
                await (0, api_key_service_1.deactivateSiteTaskKeys)(site.id, task);
                const issued = await (0, api_key_service_1.createApiKeyWithPermissions)({
                    name: `${site.code}-${task}-publisher`,
                    task,
                    siteIds: [site.id],
                    canPost: true,
                    canRead: true,
                });
                token = issued.rawApiKey;
                rotatedRows.push({ siteId: site.id, siteCode: site.code, task });
                const refreshedKey = await db_1.prisma.apiKey.findUnique({
                    where: { id: issued.id },
                    include: {
                        permissions: {
                            include: {
                                site: {
                                    select: {
                                        id: true,
                                        code: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                });
                if (refreshedKey) {
                    key = refreshedKey;
                    keyMap.set(mapKey, refreshedKey);
                }
            }
            if (!token)
                continue;
            const row = {
                siteCode: site.code,
                name: `${site.name} ${TASK_LABELS[task] || task}`,
                taskType: task,
                token,
            };
            if (typeof config.slot === "number") {
                row.slot = Number(config.slot);
            }
            exportRows.push(row);
        }
    }
    res.json({
        success: true,
        data: {
            generatedAt: new Date().toISOString(),
            filters: {
                task: taskFilter,
                addedAfter: addedAfter && !Number.isNaN(addedAfter.getTime()) ? addedAfter.toISOString() : null,
            },
            totalSites: taskFilter
                ? new Set(exportRows.map((row) => row.siteCode)).size
                : sites.length,
            totalRows: exportRows.length,
            reissueAll,
            rotatedRows,
            rows: exportRows,
        },
    });
}));
router.post("/keys", (0, auth_1.requireApiKey)("keys:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { name, scopes, task, siteIds, canPost = true, canRead = true } = req.body;
    const normalizedTaskValue = normalizeTaskValue(task);
    const normalizedTask = normalizedTaskValue === "runtime" || normalizedTaskValue === "siteMaster"
        ? normalizedTaskValue
        : normalizedTaskValue && (0, site_contract_1.isSiteTask)(normalizedTaskValue)
            ? normalizedTaskValue
            : null;
    const resolvedScopes = (0, api_key_service_1.resolveScopesForPreset)(normalizedTask, scopes);
    if (!name || resolvedScopes.length === 0) {
        throw new api_error_1.ApiError(400, "name and either scopes[] or a valid task are required.");
    }
    const key = await (0, api_key_service_1.createApiKeyWithPermissions)({
        name,
        scopes: resolvedScopes,
        task: normalizedTask,
        siteIds: Array.isArray(siteIds) ? siteIds : [],
        canPost,
        canRead,
    });
    res.status(201).json({
        success: true,
        data: key,
    });
}));
exports.default = router;
