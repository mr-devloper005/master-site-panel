import { Prisma, PostStatus } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../../config/db";
import { ensureSiteAccess, getAllowedSiteIds, requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { buildPostLiveUrl, createPublishedPost, triggerRevalidate } from "./post-service";
import { getSiteFrontendBaseUrl, isSiteTask, type SiteTask } from "../sites/site-contract";
import { logApiActivity } from "../users/user-access-service";

const router = Router();

const mapStatus = (status?: string): PostStatus | undefined => {
  if (!status) return undefined;
  if (!(status in PostStatus)) {
    throw new ApiError(400, "Invalid post status.");
  }
  return status as PostStatus;
};

const canBypassSitePermissions = (scopes: string[]): boolean => scopes.includes("*");

const parseDateBoundary = (date?: string, time?: string, endOfDay = false): Date | null => {
  const cleanDate = String(date || "").trim();
  if (!cleanDate) return null;

  const cleanTime = String(time || "").trim();
  const fallbackTime = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const value = `${cleanDate}T${cleanTime || fallbackTime}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const RESTORE_WINDOW_DAYS = 7;
const BULK_LINK_DELETE_LIMIT = 200;

const taskFromContent = (content: unknown): SiteTask | null => {
  const record = content && typeof content === "object" && !Array.isArray(content)
    ? (content as Record<string, unknown>)
    : null;
  const value = typeof record?.type === "string" ? record.type : null;
  return value && isSiteTask(value) ? value : null;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeJsonValue = (value: unknown, fieldName: string): Prisma.InputJsonValue => {
  if (value === null || value === undefined) return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  if (Array.isArray(value)) return value as Prisma.InputJsonValue;
  if (isPlainRecord(value)) return value as Prisma.InputJsonValue;
  throw new ApiError(400, `${fieldName} must be an object, array, or null.`);
};

const mergeStructuredValue = (currentValue: unknown, mergeValue: unknown): Prisma.InputJsonValue => {
  if (Array.isArray(currentValue) && Array.isArray(mergeValue)) {
    return mergeValue as Prisma.InputJsonValue;
  }
  if (isPlainRecord(currentValue) && isPlainRecord(mergeValue)) {
    return { ...currentValue, ...mergeValue } as Prisma.InputJsonValue;
  }
  return normalizeJsonValue(mergeValue, "merge payload");
};

const extractPreferredImageUrl = (content: unknown): string | null => {
  if (!isPlainRecord(content)) return null;
  const normalizedEntries = Object.entries(content).map(([key, value]) => [key.toLowerCase(), value] as const);
  const record = Object.fromEntries(normalizedEntries) as Record<string, unknown>;
  const featuredImage = typeof record.featuredimage === "string" ? record.featuredimage.trim() : "";
  if (featuredImage) return featuredImage;
  const image = typeof record.image === "string" ? record.image.trim() : "";
  if (image) return image;
  return null;
};

const syncPrimaryMediaFromContent = (currentMedia: unknown, content: unknown): Prisma.InputJsonValue | undefined => {
  const preferredImageUrl = extractPreferredImageUrl(content);
  if (!preferredImageUrl) return undefined;

  const mediaArray = Array.isArray(currentMedia) ? [...currentMedia] : [];
  const firstItem = mediaArray[0];

  if (firstItem && isPlainRecord(firstItem)) {
    mediaArray[0] = { ...firstItem, url: preferredImageUrl };
    return mediaArray as Prisma.InputJsonValue;
  }

  if (firstItem && typeof firstItem === "string") {
    mediaArray[0] = { url: preferredImageUrl };
    return mediaArray as Prisma.InputJsonValue;
  }

  return [{ url: preferredImageUrl }] as Prisma.InputJsonValue;
};

const hostFromUrl = (value?: string | null): string => {
  if (!value) return "";
  try {
    return new URL(value).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(value).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  }
};

const normalizeLinks = (input: unknown): string[] => {
  const values = Array.isArray(input)
    ? input
    : String(input || "").split(/[\n,\s]+/g);
  return Array.from(new Set(values.map((item) => String(item).trim()).filter(Boolean)));
};

const slugFromLink = (link: string): string | null => {
  try {
    const parsed = new URL(link);
    const parts = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  } catch {
    const parts = link.split("?")[0].split("/").map((part) => part.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  }
};

const archivePostsForRestore = async ({
  posts,
  apiKey,
  source,
  reason,
}: {
  posts: Array<Prisma.PostGetPayload<{ include: { site: { select: { id: true; code: true; name: true } } } }>>;
  apiKey: { id: string; name?: string | null };
  source: string;
  reason?: string | null;
}) => {
  if (!posts.length) return;

  const restoreUntil = new Date(Date.now() + RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  await prisma.deletedPost.createMany({
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
      content: post.content as Prisma.InputJsonValue,
      media: (post.media ?? Prisma.JsonNull) as Prisma.InputJsonValue,
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
      } as Prisma.InputJsonValue,
      deletedByApiKeyId: apiKey.id,
      deletedByName: apiKey.name || null,
      deletionSource: source,
      deletionReason: reason || null,
      restoreUntil,
    })),
  });
};

const restoreDeletedPostRecord = async ({
  deletedPost,
  apiKey,
}: {
  deletedPost: Prisma.DeletedPostGetPayload<{}>;
  apiKey: { id: string; scopes: string[] };
}) => {
  if (deletedPost.restoredAt) {
    throw new ApiError(400, "Post already restored.");
  }
  if (deletedPost.restoreUntil.getTime() < Date.now()) {
    throw new ApiError(410, "Restore window expired.");
  }

  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowed = await ensureSiteAccess(apiKey.id, deletedPost.siteId, "post");
    if (!allowed) throw new ApiError(403, "No posting access for this site.");
  }

  const existing = await prisma.post.findUnique({ where: { id: deletedPost.originalPostId } });
  if (existing) throw new ApiError(409, "A post with the original ID already exists.");

  const restored = await prisma.post.create({
    data: {
      id: deletedPost.originalPostId,
      siteId: deletedPost.siteId,
      externalPostId: deletedPost.externalPostId,
      title: deletedPost.title,
      slug: deletedPost.slug,
      summary: deletedPost.summary,
      metaTitle: deletedPost.metaTitle,
      metaDescription: deletedPost.metaDescription,
      content: deletedPost.content as Prisma.InputJsonValue,
      media: (deletedPost.media ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      tags: deletedPost.tags,
      authorName: deletedPost.authorName,
      status: deletedPost.status,
      publishedAt: deletedPost.publishedAt,
      createdByApiKeyId: deletedPost.createdByApiKeyId,
      createdAt: deletedPost.originalCreatedAt,
      updatedAt: deletedPost.originalUpdatedAt,
    },
  });

  await prisma.deletedPost.update({
    where: { id: deletedPost.id },
    data: { restoredAt: new Date(), restoredByApiKeyId: apiKey.id },
  });

  const site = await prisma.site.findUnique({ where: { id: deletedPost.siteId }, select: { config: true } });
  if (site) void triggerRevalidate(site.config, deletedPost.slug, taskFromContent(deletedPost.content));

  return restored;
};

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
    const taskType = req.query.taskType?.toString().trim();
    const userId = req.query.userId?.toString().trim();
    const apiKeyId = req.query.apiKeyId?.toString().trim();
    const dateFrom = req.query.dateFrom?.toString();
    const dateTo = req.query.dateTo?.toString();
    const timeFrom = req.query.timeFrom?.toString();
    const timeTo = req.query.timeTo?.toString();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);

    const where: Prisma.PostWhereInput = {};
    if (siteCode) where.site = { code: siteCode };
    if (siteId) where.siteId = siteId;
    if (status) where.status = status;
    if (taskType && taskType !== "all") {
      const taskFilter: Prisma.PostWhereInput = {
        OR: [
        { content: { path: ["type"], string_contains: taskType } },
        { content: { path: ["postType"], string_contains: taskType } },
        { content: { path: ["taskType"], string_contains: taskType } },
        { tags: { has: taskType } },
        ],
      };
      where.AND = Array.isArray(where.AND) ? [...where.AND, taskFilter] : [taskFilter];
    }

    if (apiKeyId) {
      where.createdByApiKeyId = apiKeyId;
    } else if (userId) {
      const userKeys = await prisma.apiKey.findMany({
        where: { userId },
        select: { id: true },
      });
      const keyIds = userKeys.map((key) => key.id);
      where.createdByApiKeyId = { in: keyIds.length ? keyIds : ["__no_match__"] };
    }

    const from = parseDateBoundary(dateFrom, timeFrom, false);
    const to = parseDateBoundary(dateTo || dateFrom, timeTo, true);
    if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) range.gte = from;
      if (to) range.lte = to;

      const dateFilter: Prisma.PostWhereInput = {
        OR: [{ publishedAt: range }, { createdAt: range }],
      };
      where.AND = Array.isArray(where.AND) ? [...where.AND, dateFilter] : [dateFilter];
    }

    if (search) {
      const searchFilter: Prisma.PostWhereInput = {
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
      const allowedSiteIds = await getAllowedSiteIds(apiKey.id, "read");
      where.siteId = where.siteId
        ? {
            in: allowedSiteIds.filter((id) => id === where.siteId),
          }
        : {
            in: allowedSiteIds.length > 0 ? allowedSiteIds : ["__no_match__"],
          };
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          site: { select: { id: true, name: true, code: true } },
          createdByApiKey: {
            select: {
              id: true,
              name: true,
              user: { select: { id: true, name: true, email: true, status: true } },
            },
          },
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    res.json({
      success: true,
      data: posts,
      meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
}));

router.post("/links/lookup", requireApiKey("posts:read"), asyncHandler(async (req, res) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new ApiError(401, "API key context missing.");

  const links = normalizeLinks(req.body.links || req.body.text);
  if (links.length === 0) throw new ApiError(400, "Paste at least one link.");
  if (links.length > 500) throw new ApiError(400, "Maximum 500 links can be searched at once.");

  const parsedLinks = links.map((link) => ({
    link,
    host: hostFromUrl(link),
    slug: slugFromLink(link),
  }));
  const slugs = Array.from(new Set(parsedLinks.map((item) => item.slug).filter(Boolean))) as string[];

  const posts = slugs.length
    ? await prisma.post.findMany({
        where: { slug: { in: slugs } },
        include: {
          site: { select: { id: true, code: true, name: true, config: true } },
          createdByApiKey: {
            select: {
              id: true,
              name: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      })
    : [];

  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowedSiteIds = await getAllowedSiteIds(apiKey.id, "read");
    const allowed = new Set(allowedSiteIds);
    posts.splice(0, posts.length, ...posts.filter((post) => allowed.has(post.siteId)));
  }

  const found = parsedLinks.flatMap((item) => {
    if (!item.slug) return [];
    return posts
      .filter((post) => {
        if (post.slug !== item.slug) return false;
        const siteHost = hostFromUrl(getSiteFrontendBaseUrl(post.site.config));
        const codeHost = hostFromUrl(post.site.code);
        return !item.host || item.host === siteHost || item.host === codeHost;
      })
      .map((post) => {
        const task = taskFromContent(post.content);
        const liveUrl = buildPostLiveUrl(getSiteFrontendBaseUrl(post.site.config), post.slug, post.site.config, task);
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
          createdByApiKey: post.createdByApiKey,
          payload: {
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
            externalPostId: post.externalPostId,
          },
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

router.get("/deleted", requireApiKey("posts:read"), asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100);
  const search = req.query.search?.toString().trim();
  const restorableOnly = req.query.restorableOnly !== "false";

  const where: Prisma.DeletedPostWhereInput = {};
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
    prisma.deletedPost.findMany({
      where,
      orderBy: { deletedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.deletedPost.count({ where }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
}));

router.post("/deleted/links/lookup", requireApiKey("posts:read"), asyncHandler(async (req, res) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new ApiError(401, "API key context missing.");

  const links = normalizeLinks(req.body.links || req.body.text);
  if (links.length === 0) throw new ApiError(400, "Paste at least one link.");
  if (links.length > 500) throw new ApiError(400, "Maximum 500 links can be searched at once.");

  const parsedLinks = links.map((link) => ({ link, host: hostFromUrl(link), slug: slugFromLink(link) }));
  const slugs = Array.from(new Set(parsedLinks.map((item) => item.slug).filter(Boolean))) as string[];

  let deleted = slugs.length
    ? await prisma.deletedPost.findMany({
        where: {
          slug: { in: slugs },
          restoredAt: null,
          restoreUntil: { gte: new Date() },
        },
        orderBy: { deletedAt: "desc" },
      })
    : [];

  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowedSiteIds = await getAllowedSiteIds(apiKey.id, "read");
    const allowed = new Set(allowedSiteIds);
    deleted = deleted.filter((post) => allowed.has(post.siteId));
  }

  const found = parsedLinks.flatMap((item) => {
    if (!item.slug) return [];
    return deleted
      .filter((post) => {
        if (post.slug !== item.slug) return false;
        return !item.host || item.host.includes(post.siteCode.toLowerCase()) || post.siteCode.toLowerCase().includes(item.host);
      })
      .map((post) => ({
        inputUrl: item.link,
        id: post.id,
        originalPostId: post.originalPostId,
        siteId: post.siteId,
        siteCode: post.siteCode,
        siteName: post.siteName,
        title: post.title,
        slug: post.slug,
        summary: post.summary,
        status: post.status,
        deletedAt: post.deletedAt,
        restoreUntil: post.restoreUntil,
        deletedByName: post.deletedByName,
        deletionSource: post.deletionSource,
        payload: {
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
          externalPostId: post.externalPostId,
        },
      }));
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
    },
  });
}));

router.post("/deleted/bulk/restore", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new ApiError(401, "API key context missing.");

  const deletedPostIds: string[] = Array.isArray(req.body.deletedPostIds) ? req.body.deletedPostIds : [];
  if (deletedPostIds.length === 0) throw new ApiError(400, "deletedPostIds[] is required.");
  if (deletedPostIds.length > 200) throw new ApiError(400, "Maximum 200 posts can be restored at once.");

  const deletedPosts = await prisma.deletedPost.findMany({ where: { id: { in: deletedPostIds } } });
  if (deletedPosts.length !== deletedPostIds.length) {
    throw new ApiError(404, "One or more deleted posts were not found.");
  }

  const restored = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const deletedPost of deletedPosts) {
    try {
      restored.push(await restoreDeletedPostRecord({ deletedPost, apiKey }));
    } catch (error) {
      failed.push({ id: deletedPost.id, error: error instanceof Error ? error.message : "Restore failed" });
    }
  }

  res.json({ success: true, data: { restoredCount: restored.length, failedCount: failed.length, failed } });
}));

router.post("/deleted/:deletedPostId/restore", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new ApiError(401, "API key context missing.");

  const deletedPost = await prisma.deletedPost.findUnique({ where: { id: String(req.params.deletedPostId) } });
  if (!deletedPost) throw new ApiError(404, "Deleted post history not found.");
  const restored = await restoreDeletedPostRecord({ deletedPost, apiKey });

  res.json({ success: true, data: restored });
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
    select: { siteId: true, slug: true, content: true, media: true },
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
  if (content !== undefined) updateData.content = normalizeJsonValue(content, "content");
  if (media !== undefined) updateData.media = normalizeJsonValue(media, "media");
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

  if (content !== undefined && media === undefined) {
    const syncedMedia = syncPrimaryMediaFromContent(current.media, content);
    if (syncedMedia !== undefined) {
      updateData.media = syncedMedia;
    }
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

  if (apiKey.userId) {
    void logApiActivity({
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      siteId: current.siteId,
      postId,
      taskKey: taskFromContent(updated.content),
      action: "post:update",
      status: "SUCCESS",
      method: req.method,
      path: req.path,
      ipAddress: req.ip,
    }).catch((error) => console.warn("Failed to log user API activity", error));
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
    include: { site: { select: { id: true, code: true, name: true } } },
  });
  if (!current) throw new ApiError(404, "Post not found.");

  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowed = await ensureSiteAccess(apiKey.id, current.siteId, "post");
    if (!allowed) {
      throw new ApiError(403, "No posting access for this post's site.");
    }
  }

  await archivePostsForRestore({
    posts: [current],
    apiKey,
    source: "posts-single-delete",
    reason: req.body?.reason || null,
  });

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

  if (apiKey.userId) {
    void logApiActivity({
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      siteId: current.siteId,
      postId,
      taskKey: taskFromContent(current.content),
      action: "post:delete",
      status: "SUCCESS",
      method: req.method,
      path: req.path,
      ipAddress: req.ip,
    }).catch((error) => console.warn("Failed to log user API activity", error));
  }

  res.json({ success: true, message: "Post deleted. Restore available for 7 days." });
}));

router.post("/bulk/delete", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new ApiError(401, "API key context missing.");

  const postIds: string[] = Array.isArray(req.body.postIds) ? req.body.postIds : [];
  const deleteAll = req.body.deleteAll === true;
  if (!deleteAll && postIds.length === 0) {
    throw new ApiError(400, "postIds[] is required.");
  }

  let where: Prisma.PostWhereInput = deleteAll ? {} : { id: { in: postIds } };

  if (!canBypassSitePermissions(apiKey.scopes)) {
    const allowedSiteIds = await getAllowedSiteIds(apiKey.id, "post");
    if (allowedSiteIds.length === 0) {
      throw new ApiError(403, "No posting access for any site.");
    }
    where = deleteAll
      ? { siteId: { in: allowedSiteIds } }
      : { AND: [{ id: { in: postIds } }, { siteId: { in: allowedSiteIds } }] };
  }

  if (deleteAll) {
    let deletedCount = 0;
    const batchSize = 500;

    while (true) {
      const batch = await prisma.post.findMany({
        where,
        include: { site: { select: { id: true, code: true, name: true } } },
        orderBy: { createdAt: "asc" },
        take: batchSize,
      });

      if (batch.length === 0) break;

      await archivePostsForRestore({
        posts: batch,
        apiKey,
        source: "posts-delete-all",
        reason: req.body.reason || null,
      });

      const result = await prisma.post.deleteMany({
        where: { id: { in: batch.map((post) => post.id) } },
      });
      deletedCount += result.count;
    }

    res.json({ success: true, data: { deletedCount, restoreDays: RESTORE_WINDOW_DAYS } });
    return;
  }

  const posts = await prisma.post.findMany({
    where,
    include: { site: { select: { id: true, code: true, name: true } } },
  });
  if (posts.length === 0) {
    res.json({ success: true, data: { deletedCount: 0 } });
    return;
  }

  if (posts.length !== postIds.length) {
    throw new ApiError(403, "One or more posts were not found or are outside your permission scope.");
  }

  if (posts.length > BULK_LINK_DELETE_LIMIT) {
    throw new ApiError(400, `Maximum ${BULK_LINK_DELETE_LIMIT} posts can be deleted at once.`);
  }

  await archivePostsForRestore({
    posts,
    apiKey,
    source: req.body.source || "posts-bulk-delete",
    reason: req.body.reason || null,
  });

  const result = await prisma.post.deleteMany({
    where: { id: { in: posts.map((post) => post.id) } },
  });

  if (apiKey.userId) {
    void logApiActivity({
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      action: "post:bulk-delete",
      status: "SUCCESS",
      method: req.method,
      path: req.path,
      ipAddress: req.ip,
      meta: { deletedCount: result.count } as Prisma.InputJsonValue,
    }).catch((error) => console.warn("Failed to log user API activity", error));
  }

  res.json({ success: true, data: { deletedCount: result.count, restoreDays: RESTORE_WINDOW_DAYS } });
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
    select: { id: true, siteId: true, tags: true, media: true, content: true },
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
  if (posts.length === 1 && data.title !== undefined) patch.title = String(data.title);
  if (posts.length === 1 && data.slug !== undefined) patch.slug = data.slug ? String(data.slug) : null;
  if (status) patch.status = status;
  if (data.authorName !== undefined) patch.authorName = data.authorName;
  if (data.summary !== undefined) patch.summary = data.summary;
  if (data.metaTitle !== undefined) patch.metaTitle = data.metaTitle ? String(data.metaTitle).trim() : null;
  if (data.metaDescription !== undefined) patch.metaDescription = data.metaDescription ? String(data.metaDescription).trim() : null;
  if (data.content !== undefined && posts.length === 1) patch.content = normalizeJsonValue(data.content, "content");
  if (data.media !== undefined && posts.length === 1) patch.media = normalizeJsonValue(data.media, "media");
  if (Array.isArray(data.tags) && posts.length === 1) patch.tags = data.tags.map((tag: unknown) => String(tag));
  if (data.publishedAt !== undefined) {
    patch.publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
  }

  if (posts.length === 1 && data.content !== undefined && data.media === undefined) {
    const syncedMedia = syncPrimaryMediaFromContent(posts[0].media, data.content);
    if (syncedMedia !== undefined) {
      patch.media = syncedMedia;
    }
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

  if (data.contentMerge && typeof data.contentMerge === "object") {
    await Promise.all(
      posts.map(async (post) => {
        const current = await prisma.post.findUnique({ where: { id: post.id }, select: { content: true } });
        const mergedContent = mergeStructuredValue(current?.content, data.contentMerge);
        await prisma.post.update({
          where: { id: post.id },
          data: {
            content: mergedContent,
            ...(data.mediaMerge === undefined
              ? (() => {
                  const syncedMedia = syncPrimaryMediaFromContent(post.media, mergedContent);
                  return syncedMedia !== undefined ? { media: syncedMedia } : {};
                })()
              : {}),
          },
        });
      })
    );
  }

  if (data.mediaMerge && typeof data.mediaMerge === "object") {
    await Promise.all(
      posts.map(async (post) => {
        const current = await prisma.post.findUnique({ where: { id: post.id }, select: { media: true } });
        await prisma.post.update({
          where: { id: post.id },
          data: { media: mergeStructuredValue(current?.media, data.mediaMerge) },
        });
      })
    );
  }

  if (apiKey.userId) {
    void logApiActivity({
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      action: "post:bulk-update",
      status: "SUCCESS",
      method: req.method,
      path: req.path,
      ipAddress: req.ip,
      meta: { updatedCount: updateResult.count, requestedCount: postIds.length } as Prisma.InputJsonValue,
    }).catch((error) => console.warn("Failed to log user API activity", error));
  }

  res.json({ success: true, data: { updatedCount: updateResult.count } });
}));

export default router;
