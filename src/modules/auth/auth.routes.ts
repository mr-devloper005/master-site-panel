import crypto from "crypto";
import { Router } from "express";

import { prisma } from "../../config/db";
import { requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { SITE_TASKS, type SiteTask, isSiteTask } from "../sites/site-contract";

const router = Router();

const createRawApiKey = (): string => crypto.randomBytes(24).toString("hex");
const hashApiKey = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const TASK_SCOPE_PRESETS: Record<SiteTask, string[]> = {
  listing: ["posts:write", "posts:read", "sites:read"],
  article: ["posts:write", "posts:read", "sites:read"],
  image: ["posts:write", "posts:read", "sites:read"],
  profile: ["posts:write", "posts:read", "sites:read"],
  classified: ["posts:write", "posts:read", "sites:read"],
  social: ["posts:write", "posts:read", "sites:read"],
};

const EXTRA_SCOPE_PRESETS = {
  runtime: ["sites:read"],
} as const;

type KeyPreset = SiteTask | keyof typeof EXTRA_SCOPE_PRESETS;

const inferTask = (scopes: string[]): KeyPreset | "custom" => {
  const matched = SITE_TASKS.find((task) =>
    TASK_SCOPE_PRESETS[task].every((scope) => scopes.includes(scope))
  );
  if (matched) return matched;
  if (EXTRA_SCOPE_PRESETS.runtime.every((scope) => scopes.includes(scope))) {
    return "runtime";
  }
  return "custom";
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

    const normalizedTask: KeyPreset | null =
      task === "runtime" ? "runtime" : task && isSiteTask(task) ? task : null;
    const resolvedScopes = Array.isArray(scopes) && scopes.length > 0
      ? scopes
      : normalizedTask
        ? normalizedTask === "runtime"
          ? [...EXTRA_SCOPE_PRESETS.runtime]
          : [...TASK_SCOPE_PRESETS[normalizedTask]]
        : [];

    if (!name || resolvedScopes.length === 0) {
      throw new ApiError(400, "name and either scopes[] or a valid task are required.");
    }

    const raw = createRawApiKey();
    const keyHash = hashApiKey(raw);

    const key = await prisma.apiKey.create({
      data: { name, scopes: resolvedScopes, keyHash },
      select: {
        id: true,
        name: true,
        scopes: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (Array.isArray(siteIds) && siteIds.length > 0) {
      await prisma.apiKeySitePermission.createMany({
        data: siteIds.map((siteId: string) => ({
          apiKeyId: key.id,
          siteId,
          canPost: Boolean(canPost),
          canRead: Boolean(canRead),
        })),
        skipDuplicates: true,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        ...key,
        task: normalizedTask || inferTask(resolvedScopes),
        siteIds: Array.isArray(siteIds) ? siteIds : [],
        rawApiKey: raw,
      },
    });
}));

export default router;
