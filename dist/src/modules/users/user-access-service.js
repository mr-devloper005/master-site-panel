"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceUserPostPolicy = exports.logApiActivity = void 0;
const client_1 = require("@prisma/client");
const db_1 = require("../../config/db");
const api_error_1 = require("../../utils/api-error");
const startOfToday = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
};
const logApiActivity = async ({ apiKeyId, userId, siteId, postId, taskKey, action, status, reason, method, path, ipAddress, meta, }) => {
    await db_1.prisma.apiActivityLog.create({
        data: {
            apiKeyId: apiKeyId || null,
            userId: userId || null,
            siteId: siteId || null,
            postId: postId || null,
            taskKey: taskKey || null,
            action,
            status,
            reason: reason || null,
            method: method || null,
            path: path || null,
            ipAddress: ipAddress || null,
            meta: meta ?? client_1.Prisma.JsonNull,
        },
    });
};
exports.logApiActivity = logApiActivity;
const enforceUserPostPolicy = async ({ apiKey, siteId, taskKey, action, }) => {
    if (!apiKey.userId)
        return null;
    const user = await db_1.prisma.panelUser.findUnique({
        where: { id: apiKey.userId },
        select: {
            id: true,
            status: true,
            rateLimitPerMinute: true,
            dailyPostLimit: true,
            totalPostLimit: true,
        },
    });
    if (!user || user.status !== "ACTIVE") {
        throw new api_error_1.ApiError(403, "User is not active.");
    }
    const access = await db_1.prisma.userSiteTaskAccess.findUnique({
        where: {
            userId_siteId_taskKey: {
                userId: user.id,
                siteId,
                taskKey,
            },
        },
    });
    if (!access || !access.isActive) {
        throw new api_error_1.ApiError(403, "User is not allowed to use this site/task.");
    }
    const actionAllowed = action === "read"
        ? access.canRead
        : action === "post"
            ? access.canPost
            : action === "edit"
                ? access.canEdit || access.canPost
                : access.canDelete || access.canPost;
    if (!actionAllowed) {
        throw new api_error_1.ApiError(403, `User is not allowed to ${action} this site/task.`);
    }
    if (action !== "post")
        return access;
    const keyIds = await db_1.prisma.apiKey.findMany({
        where: { userId: user.id },
        select: { id: true },
    });
    const apiKeyIds = keyIds.map((key) => key.id);
    const taskFilter = { content: { path: ["type"], equals: taskKey } };
    const baseWhere = {
        siteId,
        createdByApiKeyId: { in: apiKeyIds.length ? apiKeyIds : [apiKey.id] },
        AND: [taskFilter],
    };
    const perMinuteLimit = access.perMinuteLimit ?? user.rateLimitPerMinute;
    if (perMinuteLimit && perMinuteLimit > 0) {
        const since = new Date(Date.now() - 60 * 1000);
        const recentCount = await db_1.prisma.post.count({
            where: { ...baseWhere, createdAt: { gte: since } },
        });
        if (recentCount >= perMinuteLimit) {
            throw new api_error_1.ApiError(429, `Rate limit reached. Allowed ${perMinuteLimit} post(s) per minute.`);
        }
    }
    const dailyLimit = access.dailyLimit ?? user.dailyPostLimit;
    if (dailyLimit && dailyLimit > 0) {
        const dailyCount = await db_1.prisma.post.count({
            where: { ...baseWhere, createdAt: { gte: startOfToday() } },
        });
        if (dailyCount >= dailyLimit) {
            throw new api_error_1.ApiError(429, `Daily posting limit reached. Allowed ${dailyLimit} post(s) per day.`);
        }
    }
    const totalLimit = access.totalLimit ?? user.totalPostLimit;
    if (totalLimit && totalLimit > 0) {
        const totalCount = await db_1.prisma.post.count({ where: baseWhere });
        if (totalCount >= totalLimit) {
            throw new api_error_1.ApiError(429, `Total posting limit reached. Allowed ${totalLimit} post(s).`);
        }
    }
    return access;
};
exports.enforceUserPostPolicy = enforceUserPostPolicy;
