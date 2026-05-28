"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashApiKey = exports.getAllowedSiteIds = exports.ensureSiteAccess = exports.requireApiKey = void 0;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../config/db");
const api_error_1 = require("../utils/api-error");
const hashApiKey = (rawApiKey) => crypto_1.default.createHash("sha256").update(rawApiKey).digest("hex");
exports.hashApiKey = hashApiKey;
const hasScope = (scopes, required) => scopes.includes("*") || scopes.includes(required);
const requireApiKey = (requiredScope) => async (req, _res, next) => {
    const rawApiKey = req.header("x-api-key");
    if (!rawApiKey) {
        return next(new api_error_1.ApiError(401, "x-api-key header is required."));
    }
    const apiKey = await db_1.prisma.apiKey.findUnique({
        where: { keyHash: hashApiKey(rawApiKey) },
        include: {
            user: {
                select: { id: true, status: true },
            },
        },
    });
    if (!apiKey || !apiKey.isActive) {
        return next(new api_error_1.ApiError(401, "Invalid or inactive API key."));
    }
    if (apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now())) {
        return next(new api_error_1.ApiError(401, "API key is revoked or expired."));
    }
    if (apiKey.userId && apiKey.user?.status !== "ACTIVE") {
        return next(new api_error_1.ApiError(403, "User is not active."));
    }
    if (!hasScope(apiKey.scopes, requiredScope)) {
        return next(new api_error_1.ApiError(403, `Missing scope: ${requiredScope}`));
    }
    await db_1.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date(), lastUsedIp: req.ip },
    });
    req.apiKey = apiKey;
    next();
};
exports.requireApiKey = requireApiKey;
const ensureSiteAccess = async (apiKeyId, siteId, accessType) => {
    const key = await db_1.prisma.apiKey.findUnique({
        where: { id: apiKeyId },
        select: { userId: true },
    });
    if (key?.userId) {
        const access = await db_1.prisma.userSiteTaskAccess.findFirst({
            where: {
                userId: key.userId,
                siteId,
                isActive: true,
                ...(accessType === "post" ? { canPost: true } : { canRead: true }),
            },
            select: { id: true },
        });
        if (access)
            return true;
    }
    const permission = await db_1.prisma.apiKeySitePermission.findUnique({
        where: {
            apiKeyId_siteId: { apiKeyId, siteId },
        },
    });
    if (!permission)
        return false;
    return accessType === "post" ? permission.canPost : permission.canRead;
};
exports.ensureSiteAccess = ensureSiteAccess;
const getAllowedSiteIds = async (apiKeyId, accessType) => {
    const key = await db_1.prisma.apiKey.findUnique({
        where: { id: apiKeyId },
        select: { userId: true },
    });
    if (key?.userId) {
        const userAccess = await db_1.prisma.userSiteTaskAccess.findMany({
            where: {
                userId: key.userId,
                isActive: true,
                ...(accessType === "post" ? { canPost: true } : { canRead: true }),
            },
            distinct: ["siteId"],
            select: { siteId: true },
        });
        return userAccess.map((permission) => permission.siteId);
    }
    const permissions = await db_1.prisma.apiKeySitePermission.findMany({
        where: accessType === "post" ? { apiKeyId, canPost: true } : { apiKeyId, canRead: true },
        select: { siteId: true },
    });
    return permissions.map((permission) => permission.siteId);
};
exports.getAllowedSiteIds = getAllowedSiteIds;
