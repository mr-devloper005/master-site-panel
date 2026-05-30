import { ApiActivityStatus, PanelUserStatus, Prisma } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../../config/db";
import { requireApiKey } from "../../middleware/auth";
import { createApiKeyWithPermissions } from "../auth/api-key-service";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { getManagedSiteConfig, isSiteTask } from "../sites/site-contract";

const router = Router();

const parsePositiveInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
};

const normalizeStatus = (value: unknown): PanelUserStatus | undefined => {
  if (!value) return undefined;
  const normalized = String(value).trim().toUpperCase();
  if (!(normalized in PanelUserStatus)) {
    throw new ApiError(400, "Invalid user status.");
  }
  return normalized as PanelUserStatus;
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  notes: true,
  rateLimitPerMinute: true,
  dailyPostLimit: true,
  totalPostLimit: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      apiKeys: true,
      accessRules: true,
      apiActivityLogs: true,
    },
  },
} satisfies Prisma.PanelUserSelect;

router.get("/", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const search = String(req.query.search || "").trim();
  const status = normalizeStatus(req.query.status);

  const where: Prisma.PanelUserWhereInput = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.panelUser.findMany({
      where,
      select: userSelect,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.panelUser.count({ where }),
  ]);

  res.json({
    success: true,
    data: users,
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
}));

router.post("/", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const { name, email, notes } = req.body;
  if (!name || !email) throw new ApiError(400, "name and email are required.");

  const user = await prisma.panelUser.create({
    data: {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      notes: notes ? String(notes) : null,
      rateLimitPerMinute: parsePositiveInt(req.body.rateLimitPerMinute),
      dailyPostLimit: parsePositiveInt(req.body.dailyPostLimit),
      totalPostLimit: parsePositiveInt(req.body.totalPostLimit),
    },
    select: userSelect,
  });

  res.status(201).json({ success: true, data: user });
}));

router.patch("/:userId", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const userId = String(req.params.userId);
  const data: Prisma.PanelUserUpdateInput = {};

  if (req.body.name !== undefined) data.name = String(req.body.name).trim();
  if (req.body.email !== undefined) data.email = String(req.body.email).trim().toLowerCase();
  if (req.body.notes !== undefined) data.notes = req.body.notes ? String(req.body.notes) : null;
  if (req.body.status !== undefined) data.status = normalizeStatus(req.body.status);
  if (req.body.rateLimitPerMinute !== undefined) data.rateLimitPerMinute = parsePositiveInt(req.body.rateLimitPerMinute);
  if (req.body.dailyPostLimit !== undefined) data.dailyPostLimit = parsePositiveInt(req.body.dailyPostLimit);
  if (req.body.totalPostLimit !== undefined) data.totalPostLimit = parsePositiveInt(req.body.totalPostLimit);

  const user = await prisma.panelUser.update({
    where: { id: userId },
    data,
    select: userSelect,
  });

  res.json({ success: true, data: user });
}));

router.delete("/:userId", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const userId = String(req.params.userId);

  const [user] = await prisma.$transaction([
    prisma.panelUser.update({
      where: { id: userId },
      data: { status: PanelUserStatus.DISABLED },
      select: userSelect,
    }),
    prisma.apiKey.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    }),
    prisma.userSiteTaskAccess.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    }),
  ]);

  res.json({ success: true, data: user });
}));

router.get("/site-capabilities/list", requireApiKey("sites:read"), asyncHandler(async (_req, res) => {
  const sites = await prisma.site.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, category: true, config: true },
  });

  res.json({
    success: true,
    data: sites.map((site) => {
      const config = getManagedSiteConfig(site.code, site.config);
      return {
        id: site.id,
        code: site.code,
        name: site.name,
        category: site.category,
        tasks: Array.isArray(config.supportedTasks) ? config.supportedTasks : [],
      };
    }),
  });
}));

router.get("/:userId/keys", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const keys = await prisma.apiKey.findMany({
    where: { userId: String(req.params.userId) },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      scopes: true,
      isActive: true,
      lastUsedAt: true,
      lastUsedIp: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  res.json({ success: true, data: keys });
}));

router.post("/:userId/keys", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const userId = String(req.params.userId);
  const user = await prisma.panelUser.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "User not found.");

  const issued = await createApiKeyWithPermissions({
    name: String(req.body.name || `${user.name} publisher`).trim(),
    scopes: Array.isArray(req.body.scopes) && req.body.scopes.length
      ? req.body.scopes.map((scope: unknown) => String(scope))
      : ["posts:read", "posts:write", "sites:read"],
    siteIds: [],
  });

  const updated = await prisma.apiKey.update({
    where: { id: issued.id },
    data: {
      userId,
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
    },
    select: {
      id: true,
      name: true,
      scopes: true,
      isActive: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  res.status(201).json({
    success: true,
    data: {
      ...updated,
      rawApiKey: issued.rawApiKey,
    },
  });
}));

router.patch("/:userId/keys/:keyId", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const userId = String(req.params.userId);
  const keyId = String(req.params.keyId);
  const key = await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      ...(req.body.isActive !== undefined ? { isActive: Boolean(req.body.isActive) } : {}),
      ...(req.body.revoke === true ? { isActive: false, revokedAt: new Date() } : {}),
      ...(req.body.expiresAt !== undefined ? { expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null } : {}),
    },
    select: { id: true, userId: true, name: true, isActive: true, revokedAt: true, expiresAt: true },
  });

  if (key.userId !== userId) throw new ApiError(404, "Key does not belong to this user.");
  res.json({ success: true, data: key });
}));

router.get("/:userId/access", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const search = String(req.query.search || "").trim();
  const where: Prisma.UserSiteTaskAccessWhereInput = { userId: String(req.params.userId) };
  if (search) {
    where.site = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [items, total] = await Promise.all([
    prisma.userSiteTaskAccess.findMany({
      where,
      include: { site: { select: { id: true, code: true, name: true, config: true, isActive: true } } },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.userSiteTaskAccess.count({ where }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
}));

router.put("/:userId/access", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const userId = String(req.params.userId);
  const rules = Array.isArray(req.body.rules) ? req.body.rules : [];
  if (!rules.length) throw new ApiError(400, "rules[] is required.");
  if (rules.length > 500) throw new ApiError(400, "Maximum 500 access rules can be updated at once.");

  const updated = [];
  for (const rule of rules) {
    const siteId = String(rule.siteId || "");
    const taskKey = String(rule.taskKey || "").trim();
    if (!siteId || !isSiteTask(taskKey)) {
      throw new ApiError(400, "Each rule needs siteId and valid taskKey.");
    }

    updated.push(await prisma.userSiteTaskAccess.upsert({
      where: { userId_siteId_taskKey: { userId, siteId, taskKey } },
      update: {
        canRead: rule.canRead !== false,
        canPost: rule.canPost !== false,
        canEdit: Boolean(rule.canEdit),
        canDelete: Boolean(rule.canDelete),
        perMinuteLimit: parsePositiveInt(rule.perMinuteLimit),
        dailyLimit: parsePositiveInt(rule.dailyLimit),
        totalLimit: parsePositiveInt(rule.totalLimit),
        isActive: rule.isActive !== false,
      },
      create: {
        userId,
        siteId,
        taskKey,
        canRead: rule.canRead !== false,
        canPost: rule.canPost !== false,
        canEdit: Boolean(rule.canEdit),
        canDelete: Boolean(rule.canDelete),
        perMinuteLimit: parsePositiveInt(rule.perMinuteLimit),
        dailyLimit: parsePositiveInt(rule.dailyLimit),
        totalLimit: parsePositiveInt(rule.totalLimit),
        isActive: rule.isActive !== false,
      },
    }));
  }

  res.json({ success: true, data: { updatedCount: updated.length, rules: updated } });
}));

router.get("/:userId/posts", requireApiKey("posts:read"), asyncHandler(async (req, res) => {
  const userId = String(req.params.userId);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
  const search = String(req.query.search || "").trim();
  const siteId = String(req.query.siteId || "").trim();
  const taskKey = String(req.query.taskKey || "").trim();

  const userKeyIds = await prisma.apiKey.findMany({ where: { userId }, select: { id: true } });
  const keyIds = userKeyIds.map((key) => key.id);
  const where: Prisma.PostWhereInput = { createdByApiKeyId: { in: keyIds.length ? keyIds : ["__no_match__"] } };
  if (siteId) where.siteId = siteId;
  if (taskKey && taskKey !== "all") {
    where.AND = [{ content: { path: ["type"], equals: taskKey } }];
  }
  if (search) {
    const searchFilter: Prisma.PostWhereInput = {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ],
    };
    where.AND = Array.isArray(where.AND) ? [...where.AND, searchFilter] : [searchFilter];
  }

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: {
        site: { select: { id: true, code: true, name: true, config: true } },
        createdByApiKey: { select: { id: true, name: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
  ]);

  res.json({
    success: true,
    data: posts,
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
}));

router.get("/:userId/activity", requireApiKey("keys:write"), asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const status = String(req.query.status || "").trim().toUpperCase();
  const where: Prisma.ApiActivityLogWhereInput = { userId: String(req.params.userId) };
  if (status && status in ApiActivityStatus) where.status = status as ApiActivityStatus;

  const [logs, total] = await Promise.all([
    prisma.apiActivityLog.findMany({
      where,
      include: {
        site: { select: { id: true, code: true, name: true } },
        apiKey: { select: { id: true, name: true } },
        post: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.apiActivityLog.count({ where }),
  ]);

  res.json({
    success: true,
    data: logs,
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
}));

export default router;
