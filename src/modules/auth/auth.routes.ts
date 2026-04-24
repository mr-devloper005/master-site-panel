import { Router } from "express";

import { prisma } from "../../config/db";
import { requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { isSiteTask } from "../sites/site-contract";
import {
  createApiKeyWithPermissions,
  inferTask,
  type KeyPreset,
  resolveScopesForPreset,
} from "./api-key-service";

const router = Router();

const normalizeTaskValue = (value?: string | string[] | null): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "blog-commenting" || normalized === "blog_commenting") {
    return "comment";
  }
  if (
    normalized === "mediadistribution" ||
    normalized === "media-distribution" ||
    normalized === "media_distribution"
  ) {
    return "mediaDistribution";
  }
  return normalized;
};

router.get("/integration", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const apiKey = req.apiKey;
  if (!apiKey) {
    throw new ApiError(401, "API key context missing.");
  }

  res.json({
    success: true,
    data: {
      keyId: apiKey.id,
      name: apiKey.name,
      scopes: apiKey.scopes,
      capabilities: {
        canReadSites: apiKey.scopes.includes("*") || apiKey.scopes.includes("sites:read"),
        canWriteSites: apiKey.scopes.includes("*") || apiKey.scopes.includes("sites:write"),
        canReadPosts: apiKey.scopes.includes("*") || apiKey.scopes.includes("posts:read"),
        canWritePosts: apiKey.scopes.includes("*") || apiKey.scopes.includes("posts:write"),
        canManageKeys: apiKey.scopes.includes("*") || apiKey.scopes.includes("keys:write"),
        isSiteMaster:
          apiKey.scopes.includes("*") ||
          apiKey.scopes.includes("site:master"),
      },
    },
  });
}));

router.get("/keys", requireApiKey("keys:write"), asyncHandler(async (_req, res) => {
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      permissions: {
        include: {
          site: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  res.json({
    success: true,
    data: keys.map((key) => ({
      id: key.id,
      name: key.name,
      scopes: key.scopes,
      task: inferTask(key.scopes),
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      sitePermissions: key.permissions.map((permission) => ({
        siteId: permission.siteId,
        siteCode: permission.site.code,
        siteName: permission.site.name,
        canPost: permission.canPost,
        canRead: permission.canRead,
      })),
    })),
  });
}));

router.post("/keys", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
    const { name, scopes, task, siteIds, canPost = true, canRead = true } = req.body;

    const normalizedTaskValue = normalizeTaskValue(task);
    const normalizedTask: KeyPreset | null =
      normalizedTaskValue === "runtime" || normalizedTaskValue === "siteMaster"
        ? normalizedTaskValue
        : normalizedTaskValue && isSiteTask(normalizedTaskValue)
          ? normalizedTaskValue
          : null;
    const resolvedScopes = resolveScopesForPreset(normalizedTask, scopes);

    if (!name || resolvedScopes.length === 0) {
      throw new ApiError(400, "name and either scopes[] or a valid task are required.");
    }

    const key = await createApiKeyWithPermissions({
      name,
      scopes: resolvedScopes,
      task: normalizedTask,
      siteIds: Array.isArray(siteIds) ? siteIds : [],
      canPost,
      canRead,
    });

    res.status(201).json({
      success: true,
      data: key,
    });
}));

export default router;
