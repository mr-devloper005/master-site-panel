"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const async_handler_1 = require("../../utils/async-handler");
const site_contract_1 = require("../sites/site-contract");
const router = (0, express_1.Router)();
const createRawApiKey = () => crypto_1.default.randomBytes(24).toString("hex");
const hashApiKey = (value) => crypto_1.default.createHash("sha256").update(value).digest("hex");
const TASK_SCOPE_PRESETS = {
    listing: ["posts:write", "posts:read", "sites:read"],
    article: ["posts:write", "posts:read", "sites:read"],
    image: ["posts:write", "posts:read", "sites:read"],
    profile: ["posts:write", "posts:read", "sites:read"],
    classified: ["posts:write", "posts:read", "sites:read"],
    social: ["posts:write", "posts:read", "sites:read"],
};
const EXTRA_SCOPE_PRESETS = {
    runtime: ["sites:read"],
};
const inferTask = (scopes) => {
    const matched = site_contract_1.SITE_TASKS.find((task) => TASK_SCOPE_PRESETS[task].every((scope) => scopes.includes(scope)));
    if (matched)
        return matched;
    if (EXTRA_SCOPE_PRESETS.runtime.every((scope) => scopes.includes(scope))) {
        return "runtime";
    }
    return "custom";
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
            task: inferTask(key.scopes),
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
    const normalizedTask = task === "runtime" ? "runtime" : task && (0, site_contract_1.isSiteTask)(task) ? task : null;
    const resolvedScopes = Array.isArray(scopes) && scopes.length > 0
        ? scopes
        : normalizedTask
            ? normalizedTask === "runtime"
                ? [...EXTRA_SCOPE_PRESETS.runtime]
                : [...TASK_SCOPE_PRESETS[normalizedTask]]
            : [];
    if (!name || resolvedScopes.length === 0) {
        throw new api_error_1.ApiError(400, "name and either scopes[] or a valid task are required.");
    }
    const raw = createRawApiKey();
    const keyHash = hashApiKey(raw);
    const key = await db_1.prisma.apiKey.create({
        data: { name, scopes: resolvedScopes, keyHash },
        select: {
            id: true,
            name: true,
            scopes: true,
            isActive: true,
            createdAt: true,
        },
    });
    if (Array.isArray(siteIds) && siteIds.length > 0) {
        await db_1.prisma.apiKeySitePermission.createMany({
            data: siteIds.map((siteId) => ({
                apiKeyId: key.id,
                siteId,
                canPost: Boolean(canPost),
                canRead: Boolean(canRead),
            })),
            skipDuplicates: true,
        });
    }
    res.status(201).json({
        success: true,
        data: {
            ...key,
            task: normalizedTask || inferTask(resolvedScopes),
            siteIds: Array.isArray(siteIds) ? siteIds : [],
            rawApiKey: raw,
        },
    });
}));
exports.default = router;
