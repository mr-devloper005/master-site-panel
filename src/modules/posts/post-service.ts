import { Prisma, PostStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { ensureSiteAccess } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { getTaskScope } from "../auth/api-key-service";
import { getSiteFrontendBaseUrl, isSiteTask, sanitizeSiteConfig, type SiteTask } from "../sites/site-contract";
import { isValidCategory, normalizeCategory } from "./category-constants";

const REVALIDATE_SECRET =
  process.env.REVALIDATE_SECRET || process.env.NEXT_REVALIDATE_SECRET || "";
const REVALIDATE_ENABLED = process.env.NEXT_REVALIDATE_ENABLED !== "false";

const shouldRevalidate = (): boolean => Boolean(REVALIDATE_SECRET) && REVALIDATE_ENABLED;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeTaskValue = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "blog-commenting" || normalized === "blog_commenting") {
    return "comment";
  }
  return normalized;
};

const getTaskViewPath = (siteConfig: unknown, task: SiteTask | null) => {
  if (!task) return "/posts";
  const config = sanitizeSiteConfig(siteConfig);
  const view = config.taskViews?.[task];
  if (typeof view === "string" && view.trim()) {
    return view.startsWith("/") ? view : `/${view}`;
  }
  const defaultViews: Record<SiteTask, string> = {
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

const buildRevalidatePaths = (siteConfig: unknown, slug?: string | null, task?: SiteTask | null) => {
  if (!slug) return [];
  const paths = new Set<string>();
  const taskPath = getTaskViewPath(siteConfig, task || null);
  paths.add(`${taskPath.replace(/\/$/, "")}/${slug}`);
  paths.add(`/posts/${slug}`);
  paths.add("/listings");
  paths.add("/posts");
  paths.add("/search");
  return Array.from(paths);
};

export const triggerRevalidate = async (
  siteConfig: unknown,
  slug?: string | null,
  task?: SiteTask | null
) => {
  if (!shouldRevalidate()) return;
  const frontendBaseUrl = getSiteFrontendBaseUrl(siteConfig);
  if (!frontendBaseUrl) return;

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
  } catch (error) {
    console.warn("Revalidate request failed", error);
  } finally {
    clearTimeout(timeout);
  }
};

export const buildPostLiveUrl = (
  frontendBaseUrl: string | null,
  slug: string | null | undefined,
  siteConfig: unknown,
  task: SiteTask | null
): string | null => {
  if (!frontendBaseUrl || !slug) return null;
  const path = getTaskViewPath(siteConfig, task);
  return `${frontendBaseUrl}${path}/${slug}`;
};

type CreatePublishedPostInput = {
  apiKey: { id: string; scopes: string[] };
  siteCode: string;
  title: string;
  slug?: string | null;
  summary?: string | null;
  content: unknown;
  media?: unknown;
  tags?: unknown;
  authorName?: string | null;
  externalPostId?: string | null;
  requestedTask?: SiteTask | null;
};

export const createPublishedPost = async ({
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
  requestedTask,
}: CreatePublishedPostInput) => {
  if (!siteCode || !title || !content) {
    throw new ApiError(400, "siteCode, title and content are required.");
  }

  const site = await prisma.site.findUnique({ where: { code: siteCode } });
  if (!site || !site.isActive) {
    throw new ApiError(404, "Site not found or inactive.");
  }

  const allowed = await ensureSiteAccess(apiKey.id, site.id, "post");
  if (!allowed && !apiKey.scopes.includes("*")) {
    throw new ApiError(403, "API key is not allowed to post on this site.");
  }

  const siteConfig = sanitizeSiteConfig(site.config);
  const contentRecord =
    content && typeof content === "object" && !Array.isArray(content)
      ? ({ ...(content as Record<string, unknown>) } as Record<string, unknown>)
      : null;

  const normalizedRequestedTask = normalizeTaskValue(requestedTask);
  const contentTask = typeof contentRecord?.type === "string" ? contentRecord.type : null;
  const normalizedContentTask = normalizeTaskValue(contentTask);
  const resolvedTask =
    normalizedRequestedTask ||
    (normalizedContentTask && isSiteTask(normalizedContentTask) ? normalizedContentTask : null);
  const rawCategory =
    typeof contentRecord?.category === "string" ? contentRecord.category : null;
  const normalizedCategory = rawCategory ? normalizeCategory(rawCategory) : null;

  if (!resolvedTask) {
    throw new ApiError(400, "Task is required. Set content.type or use the task-specific endpoint.");
  }

  if (normalizedRequestedTask && normalizedContentTask && normalizedContentTask !== normalizedRequestedTask) {
    throw new ApiError(400, `Payload content.type must match task "${normalizedRequestedTask}".`);
  }

  if (rawCategory && !isValidCategory(rawCategory)) {
    throw new ApiError(400, "Category is not available. Please try with different category.");
  }

  if (resolvedTask && siteConfig.supportedTasks?.length && !siteConfig.supportedTasks.includes(resolvedTask)) {
    throw new ApiError(400, `Task "${resolvedTask}" is not enabled for this site.`);
  }

  if (!apiKey.scopes.includes("*")) {
    const canUseTask = apiKey.scopes.includes(getTaskScope(resolvedTask));
    if (!canUseTask) {
      throw new ApiError(403, `API key is not allowed to post ${resolvedTask} content.`);
    }
  }

  if (contentRecord && normalizedContentTask && contentRecord.type !== normalizedContentTask) {
    contentRecord.type = normalizedContentTask;
  }
  if (contentRecord && !contentRecord.type) {
    contentRecord.type = resolvedTask;
  }
  if (contentRecord && normalizedCategory) {
    contentRecord.category = normalizedCategory;
  }

  let commentTargetSlug: string | null = null;
  let commentTargetTitle: string | null = null;
  if (resolvedTask === "comment" && contentRecord) {
    const hasTarget =
      typeof contentRecord.articleSlug === "string" ||
      typeof contentRecord.articleId === "string";

    if (!hasTarget) {
      const recentArticles = await prisma.post.findMany({
        where: {
          siteId: site.id,
          AND: [
            { content: { path: ["type"], equals: "article" } },
            ...(normalizedCategory
              ? [{ content: { path: ["category"], equals: normalizedCategory } }]
              : []),
          ],
        },
        orderBy: { publishedAt: "desc" },
        take: 20,
        select: { id: true, slug: true, title: true },
      });

      if (!recentArticles.length) {
        throw new ApiError(
          400,
          "No recent articles available for comments in this category."
        );
      }

      const selected =
        recentArticles[Math.floor(Math.random() * recentArticles.length)];
      contentRecord.articleId = selected.id;
      contentRecord.articleSlug = selected.slug;
      contentRecord.articleTitle = selected.title;
      commentTargetSlug = selected.slug;
      commentTargetTitle = selected.title;
    } else {
      if (typeof contentRecord.articleSlug === "string") {
        commentTargetSlug = contentRecord.articleSlug;
      }
      if (typeof contentRecord.articleTitle === "string") {
        commentTargetTitle = contentRecord.articleTitle;
      }
    }

    if (!contentRecord.parentUrl && commentTargetSlug) {
      const frontendBaseUrl = getSiteFrontendBaseUrl(site.config);
      const articlePath = getTaskViewPath(site.config, "article");
      if (frontendBaseUrl) {
        contentRecord.parentUrl = `${frontendBaseUrl}${articlePath}/${commentTargetSlug}`;
      }
    }
  }

  const baseSlug = slugify(String(slug || title || "post")) || "post";
  const existing = await prisma.post.findMany({
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

  const existingSlugs = new Set(existing.map((item) => item.slug).filter(Boolean) as string[]);
  let resolvedSlug = baseSlug;
  if (existingSlugs.has(baseSlug)) {
    let max = 1;
    existingSlugs.forEach((value) => {
      const match = value.match(new RegExp(`^${baseSlug}-(\\d+)$`));
      if (match) {
        const num = Number(match[1]);
        if (Number.isFinite(num)) max = Math.max(max, num);
      }
    });
    resolvedSlug = `${baseSlug}-${max + 1}`;
  }

  const post = await prisma.post.create({
    data: {
      siteId: site.id,
      title,
      slug: resolvedSlug,
      summary,
      content: (contentRecord || content) as Prisma.InputJsonValue,
      media: (media ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      tags: Array.isArray(tags) ? tags : [],
      authorName,
      externalPostId,
      status: PostStatus.PUBLISHED,
      publishedAt: new Date(),
      createdByApiKeyId: apiKey.id,
    },
  });

  const frontendBaseUrl = getSiteFrontendBaseUrl(site.config);
  let liveUrl = buildPostLiveUrl(frontendBaseUrl, post.slug, site.config, resolvedTask);
  if (resolvedTask === "comment" && commentTargetSlug) {
    const articlePath = getTaskViewPath(site.config, "article");
    if (frontendBaseUrl) {
      liveUrl = `${frontendBaseUrl}${articlePath}/${commentTargetSlug}#comment-${post.id}`;
    }
  }

  void triggerRevalidate(site.config, post.slug, resolvedTask);
  if (resolvedTask === "comment" && commentTargetSlug) {
    void triggerRevalidate(site.config, commentTargetSlug, "article");
  }

  return {
    post,
    liveUrl,
  };
};
