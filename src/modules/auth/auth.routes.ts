import { Router } from "express";

import { prisma } from "../../config/db";
import { requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { isSiteTask, sanitizeSiteConfig } from "../sites/site-contract";
import {
  createApiKeyWithPermissions,
  decryptApiKeyToken,
  inferTask,
  type KeyPreset,
  resolveScopesForPreset,
} from "./api-key-service";

const router = Router();
const TASK_LABELS: Record<string, string> = {
  listing: "Listing",
  article: "Article",
  image: "Image",
  mediaDistribution: "Media Distribution",
  profile: "Profile",
  classified: "Classified",
  social: "Social",
  sbm: "SBM",
  comment: "Comment",
  pdf: "PDF",
  org: "Organization",
};

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

router.get("/keys/export-task-tokens", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const rotateMissing = String(req.query.rotateMissing || "false").toLowerCase() === "true";

  const [sites, keys] = await Promise.all([
    prisma.site.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        config: true,
      },
    }),
    prisma.apiKey.findMany({
      where: { isActive: true },
      orderBy: [{ createdAt: "desc" }],
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
    }),
  ]);

  const keyMap = new Map<string, (typeof keys)[number]>();
  for (const key of keys) {
    const task = inferTask(key.scopes);
    if (!isSiteTask(task)) continue;

    for (const permission of key.permissions) {
      const mapKey = `${permission.siteId}:${task}`;
      if (!keyMap.has(mapKey)) {
        keyMap.set(mapKey, key);
      }
    }
  }

  const exportRows: Array<{
    siteCode: string;
    name: string;
    taskType: string;
    token: string;
    slot?: number;
  }> = [];

  const rotatedRows: Array<{ siteId: string; siteCode: string; task: string }> = [];

  for (const site of sites) {
    const config = sanitizeSiteConfig(site.config);
    const supportedTasks = Array.isArray(config.supportedTasks)
      ? config.supportedTasks.filter(isSiteTask)
      : [];

    for (const task of supportedTasks) {
      const mapKey = `${site.id}:${task}`;
      let key = keyMap.get(mapKey) || null;
      let token = key ? decryptApiKeyToken(key.rawTokenCipher) : null;

      if ((!key || !token) && rotateMissing) {
        if (key) {
          await prisma.apiKey.update({
            where: { id: key.id },
            data: { isActive: false },
          });
        }

        const issued = await createApiKeyWithPermissions({
          name: `${site.code}-${task}-publisher`,
          task,
          siteIds: [site.id],
          canPost: true,
          canRead: true,
        });

        token = issued.rawApiKey;
        rotatedRows.push({ siteId: site.id, siteCode: site.code, task });

        const refreshedKey = await prisma.apiKey.findUnique({
          where: { id: issued.id },
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

        if (refreshedKey) {
          key = refreshedKey;
          keyMap.set(mapKey, refreshedKey);
        }
      }

      if (!token) continue;

      const row: {
        siteCode: string;
        name: string;
        taskType: string;
        token: string;
        slot?: number;
      } = {
        siteCode: site.code,
        name: `${site.name} ${TASK_LABELS[task] || task}`,
        taskType: task,
        token,
      };

      if (typeof (config as Record<string, unknown>).slot === "number") {
        row.slot = Number((config as Record<string, unknown>).slot);
      }

      exportRows.push(row);
    }
  }

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      totalSites: sites.length,
      totalRows: exportRows.length,
      rotatedRows,
      rows: exportRows,
    },
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
