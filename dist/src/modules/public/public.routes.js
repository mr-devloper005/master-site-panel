"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const db_1 = require("../../config/db");
const async_handler_1 = require("../../utils/async-handler");
const site_contract_1 = require("../sites/site-contract");
const router = (0, express_1.Router)();
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
        select: {
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
        },
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
exports.default = router;
