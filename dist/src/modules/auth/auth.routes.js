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
