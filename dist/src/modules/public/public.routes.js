"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const db_1 = require("../../config/db");
const async_handler_1 = require("../../utils/async-handler");
const contact_service_1 = require("../contact/contact-service");
const site_contract_1 = require("../sites/site-contract");
const router = (0, express_1.Router)();
const publicPostSelect = {
    id: true,
    externalPostId: true,
    title: true,
    slug: true,
    summary: true,
    metaTitle: true,
    metaDescription: true,
    content: true,
    media: true,
    tags: true,
    authorName: true,
    publishedAt: true,
    createdAt: true,
    updatedAt: true,
};
const resolvePostType = (content, tags) => {
    if (content && typeof content === "object") {
        const record = content;
        const explicitType = record.type;
        if (typeof explicitType === "string" && explicitType.trim())
            return explicitType.trim().toLowerCase();
        const postType = record.postType;
        if (typeof postType === "string" && postType.trim())
            return postType.trim().toLowerCase();
        const taskType = record.taskType;
        if (typeof taskType === "string" && taskType.trim())
            return taskType.trim().toLowerCase();
    }
    const firstTag = tags.find((tag) => typeof tag === "string" && tag.trim());
    return firstTag ? firstTag.trim().toLowerCase() : "";
};
router.get("/:siteCode/bootstrap", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteCode = String(req.params.siteCode);
    const site = await db_1.prisma.site.findUnique({
        where: { code: siteCode },
        select: {
            id: true,
            code: true,
            name: true,
            category: true,
            framework: true,
            theme: true,
            config: true,
            isActive: true,
            updatedAt: true,
        },
    });
    if (!site || !site.isActive) {
        res.status(404).json({ success: false, message: "Site not found." });
        return;
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
        },
    });
}));
router.get("/:siteCode/feed", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteCode = String(req.params.siteCode);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 1000);
    const categoryParam = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const category = categoryParam ? categoryParam.toLowerCase() : "";
    const taskParam = typeof req.query.task === "string" ? req.query.task.trim() : "";
    const task = taskParam ? taskParam.toLowerCase() : "";
    const site = await db_1.prisma.site.findUnique({
        where: { code: siteCode },
        select: {
            id: true,
            code: true,
            name: true,
            category: true,
            framework: true,
            theme: true,
            config: true,
            isActive: true,
        },
    });
    if (!site || !site.isActive) {
        res.status(404).json({ success: false, message: "Site not found." });
        return;
    }
    const posts = await db_1.prisma.post.findMany({
        where: {
            siteId: site.id,
            status: client_1.PostStatus.PUBLISHED,
            AND: [
                ...(category
                    ? [
                        {
                            content: {
                                path: ["category"],
                                equals: category,
                            },
                        },
                    ]
                    : []),
                ...(task
                    ? [
                        {
                            content: {
                                path: ["type"],
                                equals: task,
                            },
                        },
                    ]
                    : []),
            ],
        },
        orderBy: { publishedAt: "desc" },
        take: limit,
        select: publicPostSelect,
    });
    res.json({
        success: true,
        data: {
            site: {
                ...site,
                config: (0, site_contract_1.sanitizeSiteConfig)(site.config),
            },
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config),
            posts,
        },
    });
}));
router.get("/:siteCode/post/:slug", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteCode = String(req.params.siteCode);
    const slug = String(req.params.slug || "").trim();
    const taskParam = typeof req.query.task === "string" ? req.query.task.trim() : "";
    const task = taskParam ? taskParam.toLowerCase() : "";
    if (!slug) {
        res.status(400).json({ success: false, message: "Post slug is required." });
        return;
    }
    const site = await db_1.prisma.site.findUnique({
        where: { code: siteCode },
        select: {
            id: true,
            code: true,
            name: true,
            category: true,
            framework: true,
            theme: true,
            config: true,
            isActive: true,
        },
    });
    if (!site || !site.isActive) {
        res.status(404).json({ success: false, message: "Site not found." });
        return;
    }
    const post = task
        ? await db_1.prisma.post.findFirst({
            where: {
                siteId: site.id,
                status: client_1.PostStatus.PUBLISHED,
                slug,
                content: {
                    path: ["type"],
                    equals: task,
                },
            },
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            select: publicPostSelect,
        })
        : await db_1.prisma.post.findFirst({
            where: {
                siteId: site.id,
                status: client_1.PostStatus.PUBLISHED,
                slug,
            },
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            select: publicPostSelect,
        });
    // Legacy safety: older imports may have stored task in tags/postType/taskType.
    // Keep this bounded and indexed by site/status/slug; never fall back to feed scans.
    const legacyPost = post || !task
        ? post
        : (await db_1.prisma.post.findMany({
            where: {
                siteId: site.id,
                status: client_1.PostStatus.PUBLISHED,
                slug,
            },
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            take: 20,
            select: publicPostSelect,
        })).find((item) => resolvePostType(item.content, item.tags) === task) || null;
    if (!legacyPost) {
        res.status(404).json({ success: false, message: "Post not found." });
        return;
    }
    res.json({
        success: true,
        data: {
            site: {
                ...site,
                config: (0, site_contract_1.sanitizeSiteConfig)(site.config),
            },
            blueprint: (0, site_contract_1.buildSiteBlueprint)(site.code, site.config),
            post: legacyPost,
        },
    });
}));
router.post("/:siteCode/contact", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteCode = String(req.params.siteCode);
    const result = await (0, contact_service_1.createContactSubmission)(siteCode, req.body, {
        ip: req.ip || null,
        userAgent: req.header("user-agent") || null,
        referrer: req.header("referer") || req.header("referrer") || null,
    });
    res.status(201).json({
        success: true,
        data: {
            id: result.submission.id,
            status: result.submission.status,
            mail: result.mail,
        },
    });
}));
exports.default = router;
