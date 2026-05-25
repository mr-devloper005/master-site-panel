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
const parseDateBoundary = (date, time, endOfDay = false) => {
    const cleanDate = String(date || "").trim();
    if (!cleanDate)
        return null;
    const cleanTime = String(time || "").trim();
    const fallbackTime = endOfDay ? "23:59:59.999" : "00:00:00.000";
    const value = `${cleanDate}T${cleanTime || fallbackTime}`;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const RESTORE_WINDOW_DAYS = 7;
const BULK_LINK_DELETE_LIMIT = 200;
const taskFromContent = (content) => {
    const record = content && typeof content === "object" && !Array.isArray(content)
        ? content
        : null;
    const value = typeof record?.type === "string" ? record.type : null;
    return value && (0, site_contract_1.isSiteTask)(value) ? value : null;
};
const hostFromUrl = (value) => {
    if (!value)
        return "";
    try {
        return new URL(value).host.replace(/^www\./, "").toLowerCase();
    }
    catch {
        return String(value).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
    }
};
const normalizeLinks = (input) => {
    const values = Array.isArray(input)
        ? input
        : String(input || "").split(/[\n,\s]+/g);
    return Array.from(new Set(values.map((item) => String(item).trim()).filter(Boolean)));
};
const slugFromLink = (link) => {
    try {
        const parsed = new URL(link);
        const parts = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : null;
    }
    catch {
        const parts = link.split("?")[0].split("/").map((part) => part.trim()).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : null;
    }
};
const archivePostsForRestore = async ({ posts, apiKey, source, reason, }) => {
    if (!posts.length)
        return;
    const restoreUntil = new Date(Date.now() + RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    await db_1.prisma.deletedPost.createMany({
        data: posts.map((post) => ({
            originalPostId: post.id,
            siteId: post.siteId,
            siteCode: post.site.code,
            siteName: post.site.name,
            externalPostId: post.externalPostId,
            title: post.title,
            slug: post.slug,
            summary: post.summary,
            metaTitle: post.metaTitle,
            metaDescription: post.metaDescription,
            content: post.content,
            media: (post.media ?? client_1.Prisma.JsonNull),
            tags: post.tags,
            authorName: post.authorName,
            status: post.status,
            publishedAt: post.publishedAt,
            createdByApiKeyId: post.createdByApiKeyId,
            originalCreatedAt: post.createdAt,
            originalUpdatedAt: post.updatedAt,
            snapshot: {
                id: post.id,
                siteId: post.siteId,
                externalPostId: post.externalPostId,
                title: post.title,
                slug: post.slug,
                summary: post.summary,
                metaTitle: post.metaTitle,
                metaDescription: post.metaDescription,
                content: post.content,
                media: post.media,
                tags: post.tags,
                authorName: post.authorName,
                status: post.status,
                publishedAt: post.publishedAt,
                createdByApiKeyId: post.createdByApiKeyId,
                createdAt: post.createdAt,
                updatedAt: post.updatedAt,
            },
            deletedByApiKeyId: apiKey.id,
            deletedByName: apiKey.name || null,
            deletionSource: source,
            deletionReason: reason || null,
            restoreUntil,
        })),
    });
};
router.post("/", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey) {
        throw new api_error_1.ApiError(401, "API key context missing.");
    }
    const { siteCode, title, slug, summary, metaTitle, metaDescription, content, media, tags, authorName, externalPostId, } = req.body;
    const created = await (0, post_service_1.createPublishedPost)({
        apiKey,
        siteCode,
        title,
        slug,
        summary,
        metaTitle,
        metaDescription,
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
    const taskType = req.query.taskType?.toString().trim();
    const dateFrom = req.query.dateFrom?.toString();
    const dateTo = req.query.dateTo?.toString();
    const timeFrom = req.query.timeFrom?.toString();
    const timeTo = req.query.timeTo?.toString();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const where = {};
    if (siteCode)
        where.site = { code: siteCode };
    if (siteId)
        where.siteId = siteId;
    if (status)
        where.status = status;
    if (taskType && taskType !== "all") {
        const taskFilter = {
            OR: [
                { content: { path: ["type"], string_contains: taskType } },
                { content: { path: ["postType"], string_contains: taskType } },
                { content: { path: ["taskType"], string_contains: taskType } },
                { tags: { has: taskType } },
            ],
        };
        where.AND = Array.isArray(where.AND) ? [...where.AND, taskFilter] : [taskFilter];
    }
    const from = parseDateBoundary(dateFrom, timeFrom, false);
    const to = parseDateBoundary(dateTo || dateFrom, timeTo, true);
    if (from || to) {
        const range = {};
        if (from)
            range.gte = from;
        if (to)
            range.lte = to;
        const dateFilter = {
            OR: [{ publishedAt: range }, { createdAt: range }],
        };
        where.AND = Array.isArray(where.AND) ? [...where.AND, dateFilter] : [dateFilter];
    }
    if (search) {
        const searchFilter = {
            OR: [
                { title: { contains: search, mode: "insensitive" } },
                { summary: { contains: search, mode: "insensitive" } },
                { authorName: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
                { tags: { has: search } },
            ],
        };
        where.AND = Array.isArray(where.AND) ? [...where.AND, searchFilter] : [searchFilter];
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
    const [posts, total] = await Promise.all([
        db_1.prisma.post.findMany({
            where,
            include: { site: { select: { id: true, name: true, code: true } } },
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
        }),
        db_1.prisma.post.count({ where }),
    ]);
    res.json({
        success: true,
        data: posts,
        meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
}));
router.post("/links/lookup", (0, auth_1.requireApiKey)("posts:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey)
        throw new api_error_1.ApiError(401, "API key context missing.");
    const links = normalizeLinks(req.body.links || req.body.text);
    if (links.length === 0)
        throw new api_error_1.ApiError(400, "Paste at least one link.");
    if (links.length > 500)
        throw new api_error_1.ApiError(400, "Maximum 500 links can be searched at once.");
    const parsedLinks = links.map((link) => ({
        link,
        host: hostFromUrl(link),
        slug: slugFromLink(link),
    }));
    const slugs = Array.from(new Set(parsedLinks.map((item) => item.slug).filter(Boolean)));
    const posts = slugs.length
        ? await db_1.prisma.post.findMany({
            where: { slug: { in: slugs } },
            include: { site: { select: { id: true, code: true, name: true, config: true } } },
        })
        : [];
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowedSiteIds = await (0, auth_1.getAllowedSiteIds)(apiKey.id, "read");
        const allowed = new Set(allowedSiteIds);
        posts.splice(0, posts.length, ...posts.filter((post) => allowed.has(post.siteId)));
    }
    const found = parsedLinks.flatMap((item) => {
        if (!item.slug)
            return [];
        return posts
            .filter((post) => {
            if (post.slug !== item.slug)
                return false;
            const siteHost = hostFromUrl((0, site_contract_1.getSiteFrontendBaseUrl)(post.site.config));
            const codeHost = hostFromUrl(post.site.code);
            return !item.host || item.host === siteHost || item.host === codeHost;
        })
            .map((post) => {
            const task = taskFromContent(post.content);
            const liveUrl = (0, post_service_1.buildPostLiveUrl)((0, site_contract_1.getSiteFrontendBaseUrl)(post.site.config), post.slug, post.site.config, task);
            return {
                inputUrl: item.link,
                id: post.id,
                siteId: post.siteId,
                siteCode: post.site.code,
                siteName: post.site.name,
                title: post.title,
                slug: post.slug,
                summary: post.summary,
                status: post.status,
                taskType: task || "general",
                publishedAt: post.publishedAt,
                createdAt: post.createdAt,
                liveUrl,
            };
        });
    });
    const foundInputUrls = new Set(found.map((item) => item.inputUrl));
    res.json({
        success: true,
        data: {
            searchedCount: links.length,
            foundCount: found.length,
            missingCount: links.filter((link) => !foundInputUrls.has(link)).length,
            found,
            missing: links.filter((link) => !foundInputUrls.has(link)),
            bulkDeleteLimit: BULK_LINK_DELETE_LIMIT,
        },
    });
}));
router.get("/deleted", (0, auth_1.requireApiKey)("posts:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100);
    const search = req.query.search?.toString().trim();
    const restorableOnly = req.query.restorableOnly !== "false";
    const where = {};
    if (restorableOnly) {
        where.restoredAt = null;
        where.restoreUntil = { gte: new Date() };
    }
    if (search) {
        where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { siteCode: { contains: search, mode: "insensitive" } },
            { siteName: { contains: search, mode: "insensitive" } },
        ];
    }
    const [items, total] = await Promise.all([
        db_1.prisma.deletedPost.findMany({
            where,
            orderBy: { deletedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
        db_1.prisma.deletedPost.count({ where }),
    ]);
    res.json({
        success: true,
        data: items,
        meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
}));
router.post("/deleted/:deletedPostId/restore", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey)
        throw new api_error_1.ApiError(401, "API key context missing.");
    const deletedPost = await db_1.prisma.deletedPost.findUnique({ where: { id: String(req.params.deletedPostId) } });
    if (!deletedPost)
        throw new api_error_1.ApiError(404, "Deleted post history not found.");
    if (deletedPost.restoredAt)
        throw new api_error_1.ApiError(400, "Post already restored.");
    if (deletedPost.restoreUntil.getTime() < Date.now())
        throw new api_error_1.ApiError(410, "Restore window expired.");
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowed = await (0, auth_1.ensureSiteAccess)(apiKey.id, deletedPost.siteId, "post");
        if (!allowed)
            throw new api_error_1.ApiError(403, "No posting access for this site.");
    }
    const existing = await db_1.prisma.post.findUnique({ where: { id: deletedPost.originalPostId } });
    if (existing)
        throw new api_error_1.ApiError(409, "A post with the original ID already exists.");
    const restored = await db_1.prisma.post.create({
        data: {
            id: deletedPost.originalPostId,
            siteId: deletedPost.siteId,
            externalPostId: deletedPost.externalPostId,
            title: deletedPost.title,
            slug: deletedPost.slug,
            summary: deletedPost.summary,
            metaTitle: deletedPost.metaTitle,
            metaDescription: deletedPost.metaDescription,
            content: deletedPost.content,
            media: (deletedPost.media ?? client_1.Prisma.JsonNull),
            tags: deletedPost.tags,
            authorName: deletedPost.authorName,
            status: deletedPost.status,
            publishedAt: deletedPost.publishedAt,
            createdByApiKeyId: deletedPost.createdByApiKeyId,
            createdAt: deletedPost.originalCreatedAt,
            updatedAt: deletedPost.originalUpdatedAt,
        },
    });
    await db_1.prisma.deletedPost.update({
        where: { id: deletedPost.id },
        data: { restoredAt: new Date(), restoredByApiKeyId: apiKey.id },
    });
    const site = await db_1.prisma.site.findUnique({ where: { id: deletedPost.siteId }, select: { config: true } });
    if (site)
        void (0, post_service_1.triggerRevalidate)(site.config, deletedPost.slug, taskFromContent(deletedPost.content));
    res.json({ success: true, data: restored });
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
    const { title, slug, summary, metaTitle, metaDescription, content, media, tags, authorName, status, publishedAt } = req.body;
    const updateData = {};
    if (title !== undefined)
        updateData.title = title;
    if (slug !== undefined)
        updateData.slug = slug;
    if (summary !== undefined)
        updateData.summary = summary;
    if (metaTitle !== undefined)
        updateData.metaTitle = metaTitle ? String(metaTitle).trim() : null;
    if (metaDescription !== undefined)
        updateData.metaDescription = metaDescription ? String(metaDescription).trim() : null;
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
        include: { site: { select: { id: true, code: true, name: true } } },
    });
    if (!current)
        throw new api_error_1.ApiError(404, "Post not found.");
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowed = await (0, auth_1.ensureSiteAccess)(apiKey.id, current.siteId, "post");
        if (!allowed) {
            throw new api_error_1.ApiError(403, "No posting access for this post's site.");
        }
    }
    await archivePostsForRestore({
        posts: [current],
        apiKey,
        source: "posts-single-delete",
        reason: req.body?.reason || null,
    });
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
    res.json({ success: true, message: "Post deleted. Restore available for 7 days." });
}));
router.post("/bulk/delete", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey)
        throw new api_error_1.ApiError(401, "API key context missing.");
    const postIds = Array.isArray(req.body.postIds) ? req.body.postIds : [];
    const deleteAll = req.body.deleteAll === true;
    if (!deleteAll && postIds.length === 0) {
        throw new api_error_1.ApiError(400, "postIds[] is required.");
    }
    let where = deleteAll ? {} : { id: { in: postIds } };
    if (!canBypassSitePermissions(apiKey.scopes)) {
        const allowedSiteIds = await (0, auth_1.getAllowedSiteIds)(apiKey.id, "post");
        if (allowedSiteIds.length === 0) {
            throw new api_error_1.ApiError(403, "No posting access for any site.");
        }
        where = deleteAll
            ? { siteId: { in: allowedSiteIds } }
            : { AND: [{ id: { in: postIds } }, { siteId: { in: allowedSiteIds } }] };
    }
    if (deleteAll) {
        let deletedCount = 0;
        const batchSize = 500;
        while (true) {
            const batch = await db_1.prisma.post.findMany({
                where,
                include: { site: { select: { id: true, code: true, name: true } } },
                orderBy: { createdAt: "asc" },
                take: batchSize,
            });
            if (batch.length === 0)
                break;
            await archivePostsForRestore({
                posts: batch,
                apiKey,
                source: "posts-delete-all",
                reason: req.body.reason || null,
            });
            const result = await db_1.prisma.post.deleteMany({
                where: { id: { in: batch.map((post) => post.id) } },
            });
            deletedCount += result.count;
        }
        res.json({ success: true, data: { deletedCount, restoreDays: RESTORE_WINDOW_DAYS } });
        return;
    }
    const posts = await db_1.prisma.post.findMany({
        where,
        include: { site: { select: { id: true, code: true, name: true } } },
    });
    if (posts.length === 0) {
        res.json({ success: true, data: { deletedCount: 0 } });
        return;
    }
    if (posts.length !== postIds.length) {
        throw new api_error_1.ApiError(403, "One or more posts were not found or are outside your permission scope.");
    }
    if (posts.length > BULK_LINK_DELETE_LIMIT) {
        throw new api_error_1.ApiError(400, `Maximum ${BULK_LINK_DELETE_LIMIT} posts can be deleted at once.`);
    }
    await archivePostsForRestore({
        posts,
        apiKey,
        source: req.body.source || "posts-bulk-delete",
        reason: req.body.reason || null,
    });
    const result = await db_1.prisma.post.deleteMany({
        where: { id: { in: posts.map((post) => post.id) } },
    });
    res.json({ success: true, data: { deletedCount: result.count, restoreDays: RESTORE_WINDOW_DAYS } });
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
