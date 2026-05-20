import { Router } from "express";
import { PostStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { asyncHandler } from "../../utils/async-handler";
import { createContactSubmission } from "../contact/contact-service";
import { buildSiteBlueprint, sanitizeSiteConfig } from "../sites/site-contract";

const router = Router();

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

router.get("/:siteCode/bootstrap", asyncHandler(async (req, res) => {
  const siteCode = String(req.params.siteCode);

  const site = await prisma.site.findUnique({
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

  const config = sanitizeSiteConfig(site.config);

  res.json({
    success: true,
    data: {
      site: {
        ...site,
        config,
      },
      blueprint: buildSiteBlueprint(site.code, site.config),
    },
  });
}));

router.get("/:siteCode/feed", asyncHandler(async (req, res) => {
  const siteCode = String(req.params.siteCode);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 1000);
  const categoryParam = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const category = categoryParam ? categoryParam.toLowerCase() : "";
  const taskParam = typeof req.query.task === "string" ? req.query.task.trim() : "";
  const task = taskParam ? taskParam.toLowerCase() : "";

  const site = await prisma.site.findUnique({
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

  const posts = await prisma.post.findMany({
    where: {
      siteId: site.id,
      status: PostStatus.PUBLISHED,
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
        config: sanitizeSiteConfig(site.config),
      },
      blueprint: buildSiteBlueprint(site.code, site.config),
      posts,
    },
  });
}));


router.get("/:siteCode/post/:slug", asyncHandler(async (req, res) => {
  const siteCode = String(req.params.siteCode);
  const slug = String(req.params.slug || "").trim();
  const taskParam = typeof req.query.task === "string" ? req.query.task.trim() : "";
  const task = taskParam ? taskParam.toLowerCase() : "";

  if (!slug) {
    res.status(400).json({ success: false, message: "Post slug is required." });
    return;
  }

  const site = await prisma.site.findUnique({
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

  const candidates = await prisma.post.findMany({
    where: {
      siteId: site.id,
      status: PostStatus.PUBLISHED,
      slug,
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: task ? 20 : 1,
    select: publicPostSelect,
  });

  const post = task
    ? candidates.find((item) => resolvePostType(item.content, item.tags) === task) || null
    : candidates[0] || null;

  if (!post) {
    res.status(404).json({ success: false, message: "Post not found." });
    return;
  }

  res.json({
    success: true,
    data: {
      site: {
        ...site,
        config: sanitizeSiteConfig(site.config),
      },
      blueprint: buildSiteBlueprint(site.code, site.config),
      post,
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
