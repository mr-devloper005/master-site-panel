import { Router } from "express";
import { PostStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { asyncHandler } from "../../utils/async-handler";
import { createContactSubmission } from "../contact/contact-service";
import { buildSiteBlueprint, sanitizeSiteConfig } from "../sites/site-contract";

const router = Router();

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
        config: sanitizeSiteConfig(site.config),
      },
      blueprint: buildSiteBlueprint(site.code, site.config),
      posts,
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
