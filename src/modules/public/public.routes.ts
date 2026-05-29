import { Router } from "express";
import { PostStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { asyncHandler } from "../../utils/async-handler";
import { createContactSubmission } from "../contact/contact-service";
import { buildSiteBlueprint, sanitizeSiteConfig } from "../sites/site-contract";

const router = Router();

const PUBLIC_CACHE_TTL_MS = Math.max(1000, Math.min(Number(process.env.PUBLIC_API_CACHE_TTL_MS || 15000), 120000));
const PUBLIC_STALE_SECONDS = Math.max(10, Math.min(Number(process.env.PUBLIC_API_STALE_SECONDS || 60), 600));
const SLOW_PUBLIC_MS = Math.max(250, Number(process.env.PUBLIC_API_SLOW_LOG_MS || 1500));

type CacheEntry<T> = { data: T; expiresAt: number };
const publicCache = new Map<string, CacheEntry<unknown>>();

const cacheGet = <T>(key: string): T | null => {
  const hit = publicCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    publicCache.delete(key);
    return null;
  }
  return hit.data as T;
};

const cacheSet = <T>(key: string, data: T, ttlMs = PUBLIC_CACHE_TTL_MS) => {
  publicCache.set(key, { data, expiresAt: Date.now() + ttlMs });
  if (publicCache.size > 2000) {
    const now = Date.now();
    for (const [itemKey, item] of publicCache.entries()) {
      if (item.expiresAt < now) publicCache.delete(itemKey);
      if (publicCache.size <= 1500) break;
    }
  }
};

const setPublicCacheHeaders = (res: { setHeader: (name: string, value: string) => void }) => {
  const maxAge = Math.max(1, Math.floor(PUBLIC_CACHE_TTL_MS / 1000));
  res.setHeader("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${PUBLIC_STALE_SECONDS}`);
};

const warnIfSlow = (label: string, startedAt: number) => {
  const durationMs = Date.now() - startedAt;
  if (durationMs > SLOW_PUBLIC_MS) {
    console.warn(`Slow public API ${label}: ${durationMs}ms`);
  }
};

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
} as const;

const publicSiteSelect = {
  id: true,
  code: true,
  name: true,
  category: true,
  framework: true,
  theme: true,
  config: true,
  isActive: true,
  updatedAt: true,
} as const;

const resolvePostType = (content: unknown, tags: string[]): string => {
  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>;
    const explicitType = record.type;
    if (typeof explicitType === "string" && explicitType.trim()) return explicitType.trim().toLowerCase();
    const postType = record.postType;
    if (typeof postType === "string" && postType.trim()) return postType.trim().toLowerCase();
    const taskType = record.taskType;
    if (typeof taskType === "string" && taskType.trim()) return taskType.trim().toLowerCase();
  }

  const firstTag = tags.find((tag) => typeof tag === "string" && tag.trim());
  return firstTag ? firstTag.trim().toLowerCase() : "";
};

const normalizePublicMedia = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const numericKeys = Object.keys(record)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b));

  if (numericKeys.length > 0) {
    return numericKeys.map((key) => record[key]).filter(Boolean);
  }

  if (typeof record.url === "string" && record.url.trim()) {
    return [record];
  }

  return [];
};

const normalizePublicPost = <T extends typeof publicPostSelect extends infer _X ? Record<string, unknown> : Record<string, unknown>>(post: T) => ({
  ...post,
  media: normalizePublicMedia(post.media),
});

type PublicSitePayload = {
  site: { id: string; code: string; config: unknown; isActive: boolean };
  sanitizedSite: Record<string, unknown>;
  blueprint: Record<string, unknown>;
};

const getPublicSite = async (siteCode: string): Promise<PublicSitePayload | null> => {
  const key = `site:${siteCode}`;
  const cached = cacheGet<PublicSitePayload>(key);
  if (cached) return cached;

  const site = await prisma.site.findUnique({
    where: { code: siteCode },
    select: publicSiteSelect,
  });

  if (!site || !site.isActive) return null;

  const payload: PublicSitePayload = {
    site,
    sanitizedSite: {
      ...site,
      config: sanitizeSiteConfig(site.config),
    },
    blueprint: buildSiteBlueprint(site.code, site.config),
  };
  cacheSet(key, payload, PUBLIC_CACHE_TTL_MS * 4);
  return payload;
};

router.get("/:siteCode/bootstrap", asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const siteCode = String(req.params.siteCode);
  const sitePayload = await getPublicSite(siteCode);

  if (!sitePayload) {
    res.status(404).json({ success: false, message: "Site not found." });
    return;
  }

  setPublicCacheHeaders(res);
  warnIfSlow(`bootstrap:${siteCode}`, startedAt);
  res.json({
    success: true,
    data: {
      site: sitePayload.sanitizedSite,
      blueprint: sitePayload.blueprint,
    },
  });
}));

router.get("/:siteCode/feed", asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const siteCode = String(req.params.siteCode);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 1000);
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 1000000);
  const skip = (page - 1) * limit;
  const categoryParam = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const category = categoryParam ? categoryParam.toLowerCase() : "";
  const taskParam = typeof req.query.task === "string" ? req.query.task.trim() : "";
  const task = taskParam ? taskParam.toLowerCase() : "";
  const fromDays = Math.max(0, Math.floor(Number(req.query.fromDays) || 0));
  const toDays = Math.max(0, Math.floor(Number(req.query.toDays) || 0));
  const cacheKey = `feed:${siteCode}:${limit}:${page}:${category}:${task}:${fromDays}:${toDays}`;

  const cached = cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) {
    setPublicCacheHeaders(res);
    res.setHeader("X-Public-Cache", "HIT");
    res.json(cached);
    return;
  }

  const sitePayload = await getPublicSite(siteCode);
  if (!sitePayload || !sitePayload.site) {
    res.status(404).json({ success: false, message: "Site not found." });
    return;
  }

  const publishedAtFilter: { gte?: Date; lte?: Date } = {};
  const now = Date.now();
  if (toDays > 0) publishedAtFilter.gte = new Date(now - toDays * 24 * 60 * 60 * 1000);
  if (fromDays > 0) publishedAtFilter.lte = new Date(now - fromDays * 24 * 60 * 60 * 1000);

  const where = {
    siteId: sitePayload.site.id,
    status: PostStatus.PUBLISHED,
    ...(Object.keys(publishedAtFilter).length ? { publishedAt: publishedAtFilter } : {}),
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
  };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      select: publicPostSelect,
    }),
    prisma.post.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const payload = {
    success: true,
    data: {
      site: sitePayload.sanitizedSite,
      blueprint: sitePayload.blueprint,
      posts: posts.map((post) => normalizePublicPost(post)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
      },
      filters: {
        task: task || null,
        category: category || null,
        fromDays,
        toDays,
      },
    },
  };

  cacheSet(cacheKey, payload);
  setPublicCacheHeaders(res);
  res.setHeader("X-Public-Cache", "MISS");
  warnIfSlow(`feed:${siteCode}:${limit}:p${page}:${task || "all"}:${category || "all"}:${fromDays || 0}-${toDays || 0}`, startedAt);
  res.json(payload);
}));

router.get("/:siteCode/post/:slug", asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const siteCode = String(req.params.siteCode);
  const slug = String(req.params.slug || "").trim();
  const taskParam = typeof req.query.task === "string" ? req.query.task.trim() : "";
  const task = taskParam ? taskParam.toLowerCase() : "";

  if (!slug) {
    res.status(400).json({ success: false, message: "Post slug is required." });
    return;
  }

  const sitePayload = await getPublicSite(siteCode);
  if (!sitePayload || !sitePayload.site) {
    res.status(404).json({ success: false, message: "Site not found." });
    return;
  }

  const post = task
    ? await prisma.post.findFirst({
        where: {
          siteId: sitePayload.site.id,
          status: PostStatus.PUBLISHED,
          slug,
          content: {
            path: ["type"],
            equals: task,
          },
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: publicPostSelect,
      })
    : await prisma.post.findFirst({
        where: {
          siteId: sitePayload.site.id,
          status: PostStatus.PUBLISHED,
          slug,
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: publicPostSelect,
      });

  // Legacy safety: older imports may have stored task in tags/postType/taskType.
  // Keep this bounded and indexed by site/status/slug; never fall back to feed scans.
  const legacyPost = post || !task
    ? post
    : (await prisma.post.findMany({
        where: {
          siteId: sitePayload.site.id,
          status: PostStatus.PUBLISHED,
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

  res.setHeader("Cache-Control", `public, max-age=5, stale-while-revalidate=${PUBLIC_STALE_SECONDS}`);
  warnIfSlow(`post:${siteCode}:${task || "any"}:${slug}`, startedAt);
  res.json({
    success: true,
    data: {
      site: sitePayload.sanitizedSite,
      blueprint: sitePayload.blueprint,
      post: normalizePublicPost(legacyPost),
    },
  });
}));

router.post("/:siteCode/contact", asyncHandler(async (req, res) => {
  const siteCode = String(req.params.siteCode);
  const result = await createContactSubmission(siteCode, req.body, {
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

export default router;
