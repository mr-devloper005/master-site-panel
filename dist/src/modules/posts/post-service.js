"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPublishedPost = exports.buildPostLiveUrl = exports.triggerRevalidate = void 0;
const client_1 = require("@prisma/client");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const api_key_service_1 = require("../auth/api-key-service");
const site_contract_1 = require("../sites/site-contract");
const category_constants_1 = require("./category-constants");
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || process.env.NEXT_REVALIDATE_SECRET || "";
const REVALIDATE_ENABLED = process.env.NEXT_REVALIDATE_ENABLED !== "false";
const shouldRevalidate = () => Boolean(REVALIDATE_SECRET) && REVALIDATE_ENABLED;
const slugify = (value) => value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const getTaskViewPath = (siteConfig, task) => {
    if (!task)
        return "/posts";
    const config = (0, site_contract_1.sanitizeSiteConfig)(siteConfig);
    const view = config.taskViews?.[task];
    if (typeof view === "string" && view.trim()) {
        return view.startsWith("/") ? view : `/${view}`;
    }
    const defaultViews = {
        listing: "/listings",
        classified: "/classifieds",
        article: "/articles",
        image: "/image-sharing",
        profile: "/profile",
        social: "/community",
        sbm: "/sbm",
        comment: "/blog",
        pdf: "/developers",
        org: "/team",
    };
    return defaultViews[task] || "/posts";
};
const buildRevalidatePaths = (siteConfig, slug, task) => {
    if (!slug)
        return [];
    const paths = new Set();
    const taskPath = getTaskViewPath(siteConfig, task || null);
    paths.add(`${taskPath.replace(/\/$/, "")}/${slug}`);
    paths.add(`/posts/${slug}`);
    paths.add("/listings");
    paths.add("/posts");
    paths.add("/search");
    return Array.from(paths);
};
const triggerRevalidate = async (siteConfig, slug, task) => {
    if (!shouldRevalidate())
        return;
    const frontendBaseUrl = (0, site_contract_1.getSiteFrontendBaseUrl)(siteConfig);
    if (!frontendBaseUrl)
        return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
        const paths = buildRevalidatePaths(siteConfig, slug, task);
        await fetch(`${frontendBaseUrl}/api/revalidate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-revalidate-secret": REVALIDATE_SECRET,
            },
            body: JSON.stringify({ slug, paths }),
            signal: controller.signal,
        });
    }
    catch (error) {
        console.warn("Revalidate request failed", error);
    }
    finally {
        clearTimeout(timeout);
    }
};
exports.triggerRevalidate = triggerRevalidate;
const buildPostLiveUrl = (frontendBaseUrl, slug, siteConfig, task) => {
    if (!frontendBaseUrl || !slug)
        return null;
    const path = getTaskViewPath(siteConfig, task);
    return `${frontendBaseUrl}${path}/${slug}`;
};
exports.buildPostLiveUrl = buildPostLiveUrl;
const createPublishedPost = async ({ apiKey, siteCode, title, slug, summary, content, media, tags, authorName, externalPostId, requestedTask, }) => {
    if (!siteCode || !title || !content) {
        throw new api_error_1.ApiError(400, "siteCode, title and content are required.");
    }
    const site = await db_1.prisma.site.findUnique({ where: { code: siteCode } });
    if (!site || !site.isActive) {
        throw new api_error_1.ApiError(404, "Site not found or inactive.");
    }
    const allowed = await (0, auth_1.ensureSiteAccess)(apiKey.id, site.id, "post");
    if (!allowed && !apiKey.scopes.includes("*")) {
        throw new api_error_1.ApiError(403, "API key is not allowed to post on this site.");
    }
    const siteConfig = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    const contentRecord = content && typeof content === "object" && !Array.isArray(content)
        ? { ...content }
        : null;
    const contentTask = typeof contentRecord?.type === "string" ? contentRecord.type : null;
    const resolvedTask = requestedTask || (contentTask && (0, site_contract_1.isSiteTask)(contentTask) ? contentTask : null);
    const rawCategory = typeof contentRecord?.category === "string" ? contentRecord.category : null;
    const normalizedCategory = rawCategory ? (0, category_constants_1.normalizeCategory)(rawCategory) : null;
    if (!resolvedTask) {
        throw new api_error_1.ApiError(400, "Task is required. Set content.type or use the task-specific endpoint.");
    }
    if (requestedTask && contentTask && contentTask !== requestedTask) {
        throw new api_error_1.ApiError(400, `Payload content.type must match task "${requestedTask}".`);
    }
    if (rawCategory && !(0, category_constants_1.isValidCategory)(rawCategory)) {
        throw new api_error_1.ApiError(400, "Category is not available. Please try with different category.");
    }
    if (resolvedTask && siteConfig.supportedTasks?.length && !siteConfig.supportedTasks.includes(resolvedTask)) {
        throw new api_error_1.ApiError(400, `Task "${resolvedTask}" is not enabled for this site.`);
    }
    if (!apiKey.scopes.includes("*")) {
        const canUseTask = apiKey.scopes.includes((0, api_key_service_1.getTaskScope)(resolvedTask));
        if (!canUseTask) {
            throw new api_error_1.ApiError(403, `API key is not allowed to post ${resolvedTask} content.`);
        }
    }
    if (contentRecord && !contentRecord.type) {
        contentRecord.type = resolvedTask;
    }
    if (contentRecord && normalizedCategory) {
        contentRecord.category = normalizedCategory;
    }
    const baseSlug = slugify(String(slug || title || "post")) || "post";
    const existing = await db_1.prisma.post.findMany({
        where: {
            siteId: site.id,
            slug: { startsWith: baseSlug },
            AND: [
                { content: { path: ["type"], equals: resolvedTask } },
                ...(normalizedCategory
                    ? [{ content: { path: ["category"], equals: normalizedCategory } }]
                    : []),
            ],
        },
        select: { slug: true },
    });
    const existingSlugs = new Set(existing.map((item) => item.slug).filter(Boolean));
    let resolvedSlug = baseSlug;
    if (existingSlugs.has(baseSlug)) {
        let max = 1;
        existingSlugs.forEach((value) => {
            const match = value.match(new RegExp(`^${baseSlug}-(\\d+)$`));
            if (match) {
                const num = Number(match[1]);
                if (Number.isFinite(num))
                    max = Math.max(max, num);
            }
        });
        resolvedSlug = `${baseSlug}-${max + 1}`;
    }
    const post = await db_1.prisma.post.create({
        data: {
            siteId: site.id,
            title,
            slug: resolvedSlug,
            summary,
            content: (contentRecord || content),
            media: (media ?? client_1.Prisma.JsonNull),
            tags: Array.isArray(tags) ? tags : [],
            authorName,
            externalPostId,
            status: client_1.PostStatus.PUBLISHED,
            publishedAt: new Date(),
            createdByApiKeyId: apiKey.id,
        },
    });
    const frontendBaseUrl = (0, site_contract_1.getSiteFrontendBaseUrl)(site.config);
    const liveUrl = (0, exports.buildPostLiveUrl)(frontendBaseUrl, post.slug, site.config, resolvedTask);
    void (0, exports.triggerRevalidate)(site.config, post.slug, resolvedTask);
    return {
        post,
        liveUrl,
    };
};
exports.createPublishedPost = createPublishedPost;
