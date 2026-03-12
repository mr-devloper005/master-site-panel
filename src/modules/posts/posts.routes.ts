import { Prisma, PostStatus } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../../config/db";
import { ensureSiteAccess, getAllowedSiteIds, requireApiKey } from "../../middleware/auth";
import { getSiteFrontendBaseUrl } from "../sites/site-contract";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";

const router = Router();

const mapStatus = (status?: string): PostStatus | undefined => {
  if (!status) return undefined;
  if (!(status in PostStatus)) {
    throw new ApiError(400, "Invalid post status.");
  }
  return status as PostStatus;
};

const canBypassSitePermissions = (scopes: string[]): boolean => scopes.includes("*");

const REVALIDATE_SECRET = process.env.NEXT_REVALIDATE_SECRET || "";
const REVALIDATE_ENABLED = process.env.NEXT_REVALIDATE_ENABLED !== "false";

const shouldRevalidate = (): boolean => Boolean(REVALIDATE_SECRET) && REVALIDATE_ENABLED;

const triggerRevalidate = async (siteConfig: unknown, slug?: string | null) => {
  if (!shouldRevalidate()) return;
  const frontendBaseUrl = getSiteFrontendBaseUrl(siteConfig);
  if (!frontendBaseUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    await fetch(`${frontendBaseUrl}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": REVALIDATE_SECRET,
      },
      body: JSON.stringify({ slug }),
      signal: controller.signal,
    });
  } catch (error) {
    console.warn("Revalidate request failed", error);
  } finally {
    clearTimeout(timeout);
  }
};
const buildPostLiveUrl = (
  frontendBaseUrl: string | null,
  slug: string | null | undefined
): string | null => {
  if (!frontendBaseUrl || !slug) return null;
  return `${frontendBaseUrl}/posts/${slug}`;
};

router.post("/", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
    const { siteCode, title, slug, summary, content, media, tags, authorName, externalPostId } =
      req.body;

    if (!siteCode || !title || !content) {
      throw new ApiError(400, "siteCode, title and content are required.");
    }

    const site = await prisma.site.findUnique({ where: { code: siteCode } });
    if (!site || !site.isActive) {
      throw new ApiError(404, "Site not found or inactive.");
    }

    const apiKey = req.apiKey;
    if (!apiKey) {
      throw new ApiError(401, "API key context missing.");
    }

    const allowed = await ensureSiteAccess(apiKey.id, site.id, "post");
    if (!allowed && !apiKey.scopes.includes("*")) {
      throw new ApiError(403, "API key is not allowed to post on this site.");
    }

    const post = await prisma.post.create({
      data: {
        siteId: site.id,
        title,
        slug,
        summary,
        content,
        media,
        tags: Array.isArray(tags) ? tags : [],
        authorName,
        externalPostId,
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
        createdByApiKeyId: apiKey.id,
      },
    });

    const frontendBaseUrl = getSiteFrontendBaseUrl(site.config);
    const liveUrl = buildPostLiveUrl(frontendBaseUrl, post.slug);

    void triggerRevalidate(site.config, post.slug);

    res.status(201).json({
      success: true,
      data: {
        ...post,
        liveUrl,
      },
    });
}));

router.get("/", requireApiKey("posts:read"), asyncHandler(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey) {
      throw new ApiError(401, "API key context missing.");
    }

    const siteCode = req.query.siteCode?.toString();
    const siteId = req.query.siteId?.toString();
    const status = mapStatus(req.query.status?.toString());
    const search = req.query.search?.toString().trim();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);

    const where: Prisma.PostWhereInput = {};
    if (siteCode) where.site = { code: siteCode };
    if (siteId) where.siteId = siteId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
      ];
    }

    if (!canBypassSitePermissions(apiKey.scopes)) {
      const allowedSiteIds = await getAllowedSiteIds(apiKey.id, "read");
      where.siteId = where.siteId
        ? {
            in: allowedSiteIds.filter((id) => id === where.siteId),
          }
        : {
            in: allowedSiteIds.length > 0 ? allowedSiteIds : ["__no_match__"],
          };
    }

    const posts = await prisma.post.findMany({
      where,
      include: { site: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await prisma.post.count({ where });

    res.json({
      success: true,
      data: posts,
      meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
}));

router.get("/:postId", requireApiKey("posts:read"), asyncHandler(async (req, res) => {
  const postId = String(req.params.postId);
  const apiKey = req.apiKey;
  if (!apiKey) {
    throw new ApiError(401, "API key context missing.");
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { site: true },
  });
  if (!post) {
    throw new ApiError(404, "Post not found.");
  }

  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowed = await ensureSiteAccess(apiKey.id, post.siteId, "read");
    if (!allowed) {
      throw new ApiError(403, "No read access for this post's site.");
    }
  }

  res.json({ success: true, data: post });
}));

router.patch("/:postId", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
  const postId = String(req.params.postId);
  const apiKey = req.apiKey;
  if (!apiKey) {
    throw new ApiError(401, "API key context missing.");
  }

  const current = await prisma.post.findUnique({
    where: { id: postId },
    select: { siteId: true, slug: true },
  });
  if (!current) {
    throw new ApiError(404, "Post not found.");
  }
  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowed = await ensureSiteAccess(apiKey.id, current.siteId, "post");
    if (!allowed) {
      throw new ApiError(403, "No posting access for this post's site.");
    }
  }

  const { title, slug, summary, content, media, tags, authorName, status, publishedAt } = req.body;
  const updateData: Prisma.PostUpdateInput = {};

  if (title !== undefined) updateData.title = title;
  if (slug !== undefined) updateData.slug = slug;
  if (summary !== undefined) updateData.summary = summary;
  if (content !== undefined) updateData.content = content;
  if (media !== undefined) updateData.media = media;
  if (authorName !== undefined) updateData.authorName = authorName;
  if (tags !== undefined) {
    if (!Array.isArray(tags)) throw new ApiError(400, "tags must be array.");
    updateData.tags = tags.map((tag: unknown) => String(tag));
  }
  if (status !== undefined) {
    updateData.status = mapStatus(status);
  }
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data: updateData,
  });

  const site = await prisma.site.findUnique({
    where: { id: current.siteId },
    select: { config: true },
  });
  if (site) {
    void triggerRevalidate(site.config, updated.slug);
  }

  res.json({ success: true, data: updated });
}));

router.delete("/:postId", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
  const postId = String(req.params.postId);
  const apiKey = req.apiKey;
  if (!apiKey) {
    throw new ApiError(401, "API key context missing.");
  }

  const current = await prisma.post.findUnique({
    where: { id: postId },
    select: { siteId: true, slug: true },
  });
  if (!current) throw new ApiError(404, "Post not found.");

  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowed = await ensureSiteAccess(apiKey.id, current.siteId, "post");
    if (!allowed) {
      throw new ApiError(403, "No posting access for this post's site.");
    }
  }

  await prisma.post.delete({ where: { id: postId } });

  const site = await prisma.site.findUnique({
    where: { id: current.siteId },
    select: { config: true },
  });
  if (site) {
    void triggerRevalidate(site.config, current.slug);
  }

  res.json({ success: true, message: "Post deleted." });
}));

router.post("/bulk/delete", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new ApiError(401, "API key context missing.");

  const postIds: string[] = Array.isArray(req.body.postIds) ? req.body.postIds : [];
  if (postIds.length === 0) {
    throw new ApiError(400, "postIds[] is required.");
  }

  const posts = await prisma.post.findMany({
    where: { id: { in: postIds } },
    select: { id: true, siteId: true },
  });
  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowedSiteIds = await getAllowedSiteIds(apiKey.id, "post");
    const unauthorized = posts.some((post) => !allowedSiteIds.includes(post.siteId));
    if (unauthorized) {
      throw new ApiError(403, "One or more posts are outside your permission scope.");
    }
  }

  const result = await prisma.post.deleteMany({
    where: { id: { in: posts.map((post) => post.id) } },
  });

  res.json({ success: true, data: { deletedCount: result.count } });
}));

router.post("/bulk/update", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new ApiError(401, "API key context missing.");

  const postIds: string[] = Array.isArray(req.body.postIds) ? req.body.postIds : [];
  const data = req.body.data ?? {};
  if (postIds.length === 0) {
    throw new ApiError(400, "postIds[] is required.");
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError(400, "data object is required for bulk update.");
  }

  const posts = await prisma.post.findMany({
    where: { id: { in: postIds } },
    select: { id: true, siteId: true, tags: true },
  });
  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowedSiteIds = await getAllowedSiteIds(apiKey.id, "post");
    const unauthorized = posts.some((post) => !allowedSiteIds.includes(post.siteId));
    if (unauthorized) {
      throw new ApiError(403, "One or more posts are outside your permission scope.");
    }
  }

  const status = mapStatus(data.status);
  const patch: Prisma.PostUpdateManyMutationInput = {};
  if (status) patch.status = status;
  if (data.authorName !== undefined) patch.authorName = data.authorName;
  if (data.summary !== undefined) patch.summary = data.summary;
  if (data.publishedAt !== undefined) {
    patch.publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
  }

  const updateResult =
    Object.keys(patch).length === 0
      ? { count: posts.length }
      : await prisma.post.updateMany({
          where: { id: { in: posts.map((post) => post.id) } },
          data: patch,
        });

  if (Array.isArray(data.appendTags) && data.appendTags.length > 0) {
    const uniqueTags = Array.from(
      new Set(data.appendTags.map((tag: unknown) => String(tag).trim()).filter(Boolean))
    ) as string[];
    await Promise.all(
      posts.map((post) =>
        prisma.post.update({
          where: { id: post.id },
          data: { tags: Array.from(new Set([...post.tags, ...uniqueTags])) },
        })
      )
    );
  }

  res.json({ success: true, data: { updatedCount: updateResult.count } });
}));

export default router;
