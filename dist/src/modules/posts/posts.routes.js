"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const express_1 = require("express");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const async_handler_1 = require("../../utils/async-handler");
const post_service_1 = require("./post-service");
const site_contract_1 = require("../sites/site-contract");
const router = (0, express_1.Router)();
const mapStatus = (status) => {
    if (!status)
        return undefined;
    if (!(status in client_1.PostStatus)) {
        throw new api_error_1.ApiError(400, "Invalid post status.");
    }
    return status;
};
const canBypassSitePermissions = (scopes) => scopes.includes("*");
router.post("/", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey) {
        throw new api_error_1.ApiError(401, "API key context missing.");
    }
    const { siteCode, title, slug, summary, content, media, tags, authorName, externalPostId } = req.body;
    const created = await (0, post_service_1.createPublishedPost)({
        apiKey,
        siteCode,
        title,
        slug,
        summary,
        content,
        media,
        tags,
        authorName,
        externalPostId,
    });
    res.status(201).json({
        success: true,
        data: {
            ...created.post,
            liveUrl: created.liveUrl,
        },
    });
}));
router.get("/", (0, auth_1.requireApiKey)("posts:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey) {
        throw new api_error_1.ApiError(401, "API key context missing.");
    }
    const siteCode = req.query.siteCode?.toString();
    const siteId = req.query.siteId?.toString();
    const status = mapStatus(req.query.status?.toString());
    const search = req.query.search?.toString().trim();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const where = {};
    if (siteCode)
        where.site = { code: siteCode };
    if (siteId)
        where.siteId = siteId;
    if (status)
        where.status = status;
    if (search) {
        where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { summary: { contains: search, mode: "insensitive" } },
            { tags: { has: search } },
        ];
    }
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowedSiteIds = await (0, auth_1.getAllowedSiteIds)(apiKey.id, "read");
        where.siteId = where.siteId
            ? {
                in: allowedSiteIds.filter((id) => id === where.siteId),
            }
            : {
                in: allowedSiteIds.length > 0 ? allowedSiteIds : ["__no_match__"],
            };
    }
    const posts = await db_1.prisma.post.findMany({
        where,
        include: { site: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
    });
    const total = await db_1.prisma.post.count({ where });
    res.json({
        success: true,
        data: posts,
        meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
}));
router.get("/:postId", (0, auth_1.requireApiKey)("posts:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const postId = String(req.params.postId);
    const apiKey = req.apiKey;
    if (!apiKey) {
        throw new api_error_1.ApiError(401, "API key context missing.");
    }
    const post = await db_1.prisma.post.findUnique({
        where: { id: postId },
        include: { site: true },
    });
    if (!post) {
        throw new api_error_1.ApiError(404, "Post not found.");
    }
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowed = await (0, auth_1.ensureSiteAccess)(apiKey.id, post.siteId, "read");
        if (!allowed) {
            throw new api_error_1.ApiError(403, "No read access for this post's site.");
        }
    }
    res.json({ success: true, data: post });
}));
router.patch("/:postId", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const postId = String(req.params.postId);
    const apiKey = req.apiKey;
    if (!apiKey) {
        throw new api_error_1.ApiError(401, "API key context missing.");
    }
    const current = await db_1.prisma.post.findUnique({
        where: { id: postId },
        select: { siteId: true, slug: true, content: true },
    });
    if (!current) {
        throw new api_error_1.ApiError(404, "Post not found.");
    }
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowed = await (0, auth_1.ensureSiteAccess)(apiKey.id, current.siteId, "post");
        if (!allowed) {
            throw new api_error_1.ApiError(403, "No posting access for this post's site.");
        }
    }
    const { title, slug, summary, content, media, tags, authorName, status, publishedAt } = req.body;
    const updateData = {};
    if (title !== undefined)
        updateData.title = title;
    if (slug !== undefined)
        updateData.slug = slug;
    if (summary !== undefined)
        updateData.summary = summary;
    if (content !== undefined)
        updateData.content = content;
    if (media !== undefined)
        updateData.media = media;
    if (authorName !== undefined)
        updateData.authorName = authorName;
    if (tags !== undefined) {
        if (!Array.isArray(tags))
            throw new api_error_1.ApiError(400, "tags must be array.");
        updateData.tags = tags.map((tag) => String(tag));
    }
    if (status !== undefined) {
        updateData.status = mapStatus(status);
    }
    if (publishedAt !== undefined) {
        updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
    }
    const updated = await db_1.prisma.post.update({
        where: { id: postId },
        data: updateData,
    });
    const site = await db_1.prisma.site.findUnique({
        where: { id: current.siteId },
        select: { config: true },
    });
    if (site) {
        const contentRecord = updated.content && typeof updated.content === "object" && !Array.isArray(updated.content)
            ? updated.content
            : null;
        const task = typeof contentRecord?.type === "string" && (0, site_contract_1.isSiteTask)(contentRecord.type)
            ? contentRecord.type
            : null;
        void (0, post_service_1.triggerRevalidate)(site.config, updated.slug, task);
    }
    res.json({ success: true, data: updated });
}));
router.delete("/:postId", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const postId = String(req.params.postId);
    const apiKey = req.apiKey;
    if (!apiKey) {
        throw new api_error_1.ApiError(401, "API key context missing.");
    }
    const current = await db_1.prisma.post.findUnique({
        where: { id: postId },
        select: { siteId: true, slug: true, content: true },
    });
    if (!current)
        throw new api_error_1.ApiError(404, "Post not found.");
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowed = await (0, auth_1.ensureSiteAccess)(apiKey.id, current.siteId, "post");
        if (!allowed) {
            throw new api_error_1.ApiError(403, "No posting access for this post's site.");
        }
    }
    await db_1.prisma.post.delete({ where: { id: postId } });
    const site = await db_1.prisma.site.findUnique({
        where: { id: current.siteId },
        select: { config: true },
    });
    if (site) {
        const contentRecord = current.content && typeof current.content === "object" && !Array.isArray(current.content)
            ? current.content
            : null;
        const task = typeof contentRecord?.type === "string" && (0, site_contract_1.isSiteTask)(contentRecord.type)
            ? contentRecord.type
            : null;
        void (0, post_service_1.triggerRevalidate)(site.config, current.slug, task);
    }
    res.json({ success: true, message: "Post deleted." });
}));
router.post("/bulk/delete", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey)
        throw new api_error_1.ApiError(401, "API key context missing.");
    const postIds = Array.isArray(req.body.postIds) ? req.body.postIds : [];
    if (postIds.length === 0) {
        throw new api_error_1.ApiError(400, "postIds[] is required.");
    }
    const posts = await db_1.prisma.post.findMany({
        where: { id: { in: postIds } },
        select: { id: true, siteId: true },
    });
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowedSiteIds = await (0, auth_1.getAllowedSiteIds)(apiKey.id, "post");
        const unauthorized = posts.some((post) => !allowedSiteIds.includes(post.siteId));
        if (unauthorized) {
            throw new api_error_1.ApiError(403, "One or more posts are outside your permission scope.");
        }
    }
    const result = await db_1.prisma.post.deleteMany({
        where: { id: { in: posts.map((post) => post.id) } },
    });
    res.json({ success: true, data: { deletedCount: result.count } });
}));
router.post("/bulk/update", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey)
        throw new api_error_1.ApiError(401, "API key context missing.");
    const postIds = Array.isArray(req.body.postIds) ? req.body.postIds : [];
    const data = req.body.data ?? {};
    if (postIds.length === 0) {
        throw new api_error_1.ApiError(400, "postIds[] is required.");
    }
    if (Object.keys(data).length === 0) {
        throw new api_error_1.ApiError(400, "data object is required for bulk update.");
    }
    const posts = await db_1.prisma.post.findMany({
        where: { id: { in: postIds } },
        select: { id: true, siteId: true, tags: true },
    });
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowedSiteIds = await (0, auth_1.getAllowedSiteIds)(apiKey.id, "post");
        const unauthorized = posts.some((post) => !allowedSiteIds.includes(post.siteId));
        if (unauthorized) {
            throw new api_error_1.ApiError(403, "One or more posts are outside your permission scope.");
        }
    }
    const status = mapStatus(data.status);
    const patch = {};
    if (status)
        patch.status = status;
    if (data.authorName !== undefined)
        patch.authorName = data.authorName;
    if (data.summary !== undefined)
        patch.summary = data.summary;
    if (data.publishedAt !== undefined) {
        patch.publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
    }
    const updateResult = Object.keys(patch).length === 0
        ? { count: posts.length }
        : await db_1.prisma.post.updateMany({
            where: { id: { in: posts.map((post) => post.id) } },
            data: patch,
        });
    if (Array.isArray(data.appendTags) && data.appendTags.length > 0) {
        const uniqueTags = Array.from(new Set(data.appendTags.map((tag) => String(tag).trim()).filter(Boolean)));
        await Promise.all(posts.map((post) => db_1.prisma.post.update({
            where: { id: post.id },
            data: { tags: Array.from(new Set([...post.tags, ...uniqueTags])) },
        })));
    }
    res.json({ success: true, data: { updatedCount: updateResult.count } });
}));
exports.default = router;
