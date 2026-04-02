import { Prisma, PostStatus } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../../config/db";
import { ensureSiteAccess, getAllowedSiteIds, requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { createPublishedPost, triggerRevalidate } from "./post-service";
import { isSiteTask } from "../sites/site-contract";

const router = Router();

const mapStatus = (status?: string): PostStatus | undefined => {
  if (!status) return undefined;
  if (!(status in PostStatus)) {
    throw new ApiError(400, "Invalid post status.");
  }
  return status as PostStatus;
};

const canBypassSitePermissions = (scopes: string[]): boolean => scopes.includes("*");

router.post("/", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey) {
      throw new ApiError(401, "API key context missing.");
    }

    const {
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
    } = req.body;
    const created = await createPublishedPost({
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
    select: { siteId: true, slug: true, content: true },
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

  const { title, slug, summary, metaTitle, metaDescription, content, media, tags, authorName, status, publishedAt } = req.body;
  const updateData: Prisma.PostUpdateInput = {};

  if (title !== undefined) updateData.title = title;
  if (slug !== undefined) updateData.slug = slug;
  if (summary !== undefined) updateData.summary = summary;
  if (metaTitle !== undefined) updateData.metaTitle = metaTitle ? String(metaTitle).trim() : null;
  if (metaDescription !== undefined) updateData.metaDescription = metaDescription ? String(metaDescription).trim() : null;
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
    const contentRecord =
      updated.content && typeof updated.content === "object" && !Array.isArray(updated.content)
        ? (updated.content as Record<string, unknown>)
        : null;
    const task =
      typeof contentRecord?.type === "string" && isSiteTask(contentRecord.type)
        ? contentRecord.type
        : null;
    void triggerRevalidate(site.config, updated.slug, task);
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
    select: { siteId: true, slug: true, content: true },
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
    const contentRecord =
      current.content && typeof current.content === "object" && !Array.isArray(current.content)
        ? (current.content as Record<string, unknown>)
        : null;
    const task =
      typeof contentRecord?.type === "string" && isSiteTask(contentRecord.type)
        ? contentRecord.type
        : null;
    void triggerRevalidate(site.config, current.slug, task);
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
