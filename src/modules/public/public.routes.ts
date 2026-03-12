import { Router } from "express";
import { PostStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { asyncHandler } from "../../utils/async-handler";
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
  const limit = Math.min(Number(req.query.limit) || 20, 100);

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
    where: { siteId: site.id, status: PostStatus.PUBLISHED },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      externalPostId: true,
      title: true,
      slug: true,
      summary: true,
      content: true,
      media: true,
      tags: true,
      authorName: true,
      publishedAt: true,
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

export default router;
