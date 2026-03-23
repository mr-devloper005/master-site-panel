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

const normalizeTaskValue = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "blog-commenting" || normalized === "blog_commenting") {
    return "comment";
  }
  return normalized;
};

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
