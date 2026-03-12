import { Prisma } from "@prisma/client";
import { Router } from "express";
import { SiteCategory, SiteFramework } from "@prisma/client";

import { prisma } from "../../config/db";
import { requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { getLatestRuntimeStatusMap, getRuntimeStatusesForSite } from "../runtime/runtime-store";
import { buildSiteBlueprint, sanitizeSiteConfig } from "./site-contract";

const router = Router();

router.get("/", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const search = req.query.search?.toString().trim();
  const framework = req.query.framework?.toString();
  const category = req.query.category?.toString();
  const isActive = req.query.isActive?.toString();
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);

  const where: Prisma.SiteWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }
  if (framework && framework in SiteFramework) {
    where.framework = framework as SiteFramework;
  }
  if (category && category in SiteCategory) {
    where.category = category as SiteCategory;
  }
  if (isActive === "true" || isActive === "false") {
    where.isActive = isActive === "true";
  }

  const sites = await prisma.site.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      _count: {
        select: { posts: true },
      },
    },
  });
  const total = await prisma.site.count({ where });
  const runtimeMap = await getLatestRuntimeStatusMap(sites.map((site) => site.id));

  res.json({
    success: true,
    data: sites.map((site) => ({
      ...site,
      runtimeStatuses: runtimeMap.get(site.id) ? [runtimeMap.get(site.id)] : [],
      config: sanitizeSiteConfig(site.config),
      blueprint: buildSiteBlueprint(site.code, site.config),
    })),
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
}));

router.get("/:siteId", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      _count: { select: { posts: true } },
      posts: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          publishedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const runtimeStatuses = await getRuntimeStatusesForSite(siteId);

  res.json({
    success: true,
    data: {
      ...site,
      runtimeStatuses,
      config: sanitizeSiteConfig(site.config),
      blueprint: buildSiteBlueprint(site.code, site.config),
    },
  });
}));

router.post("/", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
    const { code, name, framework, category, theme, config } = req.body;

    if (!code || !name || !framework || !category) {
      throw new ApiError(
        400,
        "code, name, framework and category are required fields."
      );
    }

    if (!(framework in SiteFramework)) {
      throw new ApiError(400, "Invalid framework value.");
    }

    if (!(category in SiteCategory)) {
      throw new ApiError(400, "Invalid category value.");
    }

    const created = await prisma.site.create({
      data: {
        code,
        name,
        framework,
        category,
        theme,
        config: sanitizeSiteConfig(config),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...created,
        config: sanitizeSiteConfig(created.config),
        blueprint: buildSiteBlueprint(created.code, created.config),
      },
    });
}));

router.post(
  "/:siteId/permissions",
  requireApiKey("sites:write"),
  asyncHandler(async (req, res) => {
      const { siteId } = req.params;
      const resolvedSiteId = String(siteId);
      const { apiKeyId, canPost = true, canRead = true } = req.body;

      if (!apiKeyId) {
        throw new ApiError(400, "apiKeyId is required.");
      }

      const permission = await prisma.apiKeySitePermission.upsert({
        where: { apiKeyId_siteId: { apiKeyId, siteId: resolvedSiteId } },
        update: { canPost, canRead },
        create: { apiKeyId, siteId: resolvedSiteId, canPost, canRead },
      });

      res.status(201).json({ success: true, data: permission });
    })
);

router.patch("/:siteId/archive", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const site = await prisma.site.update({
    where: { id: String(req.params.siteId) },
    data: { isActive: false },
  });

  res.json({ success: true, data: site });
}));

router.patch("/:siteId", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const { name, framework, category, theme, config, isActive } = req.body;

  const updateData: Prisma.SiteUpdateInput = {};
  if (name !== undefined) updateData.name = name;
  if (theme !== undefined) updateData.theme = theme;
  if (config !== undefined) updateData.config = sanitizeSiteConfig(config);
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);
  if (framework !== undefined) {
    if (!(framework in SiteFramework)) {
      throw new ApiError(400, "Invalid framework value.");
    }
    updateData.framework = framework as SiteFramework;
  }
  if (category !== undefined) {
    if (!(category in SiteCategory)) {
      throw new ApiError(400, "Invalid category value.");
    }
    updateData.category = category as SiteCategory;
  }

  const site = await prisma.site.update({
    where: { id: siteId },
    data: updateData,
  });

  res.json({
    success: true,
    data: {
      ...site,
      config: sanitizeSiteConfig(site.config),
      blueprint: buildSiteBlueprint(site.code, site.config),
    },
  });
}));

router.get("/:siteId/blueprint", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const site = await prisma.site.findUnique({
    where: { id: String(req.params.siteId) },
    select: {
      id: true,
      code: true,
      name: true,
      framework: true,
      category: true,
      config: true,
    },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
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
      integrationSteps: [
        "Set backend URL and site code in the frontend environment.",
        "Use the public bootstrap endpoint to hydrate site metadata and supported tasks.",
        "Use the public feed endpoint for server-rendered content pages.",
        "Use a task-specific API key from the admin panel for post creation and automation tools.",
      ],
    },
  });
}));

router.delete("/:siteId", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  await prisma.site.delete({ where: { id: siteId } });
  res.json({ success: true, message: "Site deleted." });
}));

export default router;
