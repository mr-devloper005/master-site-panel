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
    });
    if (!apiKey || !apiKey.isActive) {
        return next(new api_error_1.ApiError(401, "Invalid or inactive API key."));
    }
    if (!hasScope(apiKey.scopes, requiredScope)) {
        return next(new api_error_1.ApiError(403, `Missing scope: ${requiredScope}`));
    }
    await db_1.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
    });
    req.apiKey = apiKey;
    next();
};
exports.requireApiKey = requireApiKey;
const ensureSiteAccess = async (apiKeyId, siteId, accessType) => {
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
    const permissions = await db_1.prisma.apiKeySitePermission.findMany({
        where: accessType === "post" ? { apiKeyId, canPost: true } : { apiKeyId, canRead: true },
        select: { siteId: true },
    });
    return permissions.map((permission) => permission.siteId);
};
exports.getAllowedSiteIds = getAllowedSiteIds;
