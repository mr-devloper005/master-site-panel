import { ApiActivityStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { ApiError } from "../../utils/api-error";

type ApiKeyContext = {
  id: string;
  userId?: string | null;
};

type UserPolicyInput = {
  apiKey: ApiKeyContext;
  siteId: string;
  taskKey: string;
  action: "read" | "post" | "edit" | "delete";
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export const logApiActivity = async ({
  apiKeyId,
  userId,
  siteId,
  postId,
  taskKey,
  action,
  status,
  reason,
  method,
  path,
  ipAddress,
  meta,
}: {
  apiKeyId?: string | null;
  userId?: string | null;
  siteId?: string | null;
  postId?: string | null;
  taskKey?: string | null;
  action: string;
  status: ApiActivityStatus;
  reason?: string | null;
  method?: string | null;
  path?: string | null;
  ipAddress?: string | null;
  meta?: Prisma.InputJsonValue | null;
}) => {
  await prisma.apiActivityLog.create({
    data: {
      apiKeyId: apiKeyId || null,
      userId: userId || null,
      siteId: siteId || null,
      postId: postId || null,
      taskKey: taskKey || null,
      action,
      status,
      reason: reason || null,
      method: method || null,
      path: path || null,
      ipAddress: ipAddress || null,
      meta: meta ?? Prisma.JsonNull,
    },
  });
};

export const enforceUserPostPolicy = async ({
  apiKey,
  siteId,
  taskKey,
  action,
}: UserPolicyInput) => {
  if (!apiKey.userId) return null;

  const user = await prisma.panelUser.findUnique({
    where: { id: apiKey.userId },
    select: {
      id: true,
      status: true,
      rateLimitPerMinute: true,
      dailyPostLimit: true,
      totalPostLimit: true,
    },
  });

  if (!user || user.status !== "ACTIVE") {
    throw new ApiError(403, "User is not active.");
  }

  const access = await prisma.userSiteTaskAccess.findUnique({
    where: {
      userId_siteId_taskKey: {
        userId: user.id,
        siteId,
        taskKey,
      },
    },
  });

  if (!access || !access.isActive) {
    throw new ApiError(403, "User is not allowed to use this site/task.");
  }

  const actionAllowed =
    action === "read"
      ? access.canRead
      : action === "post"
        ? access.canPost
        : action === "edit"
          ? access.canEdit || access.canPost
          : access.canDelete || access.canPost;

  if (!actionAllowed) {
    throw new ApiError(403, `User is not allowed to ${action} this site/task.`);
  }

  if (action !== "post") return access;

  const keyIds = await prisma.apiKey.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const apiKeyIds = keyIds.map((key) => key.id);
  const taskFilter: Prisma.PostWhereInput = { content: { path: ["type"], equals: taskKey } };
  const baseWhere: Prisma.PostWhereInput = {
    siteId,
    createdByApiKeyId: { in: apiKeyIds.length ? apiKeyIds : [apiKey.id] },
    AND: [taskFilter],
  };

  const perMinuteLimit = access.perMinuteLimit ?? user.rateLimitPerMinute;
  if (perMinuteLimit && perMinuteLimit > 0) {
    const since = new Date(Date.now() - 60 * 1000);
    const recentCount = await prisma.post.count({
      where: { ...baseWhere, createdAt: { gte: since } },
    });
    if (recentCount >= perMinuteLimit) {
      throw new ApiError(429, `Rate limit reached. Allowed ${perMinuteLimit} post(s) per minute.`);
    }
  }

  const dailyLimit = access.dailyLimit ?? user.dailyPostLimit;
  if (dailyLimit && dailyLimit > 0) {
    const dailyCount = await prisma.post.count({
      where: { ...baseWhere, createdAt: { gte: startOfToday() } },
    });
    if (dailyCount >= dailyLimit) {
      throw new ApiError(429, `Daily posting limit reached. Allowed ${dailyLimit} post(s) per day.`);
    }
  }

  const totalLimit = access.totalLimit ?? user.totalPostLimit;
  if (totalLimit && totalLimit > 0) {
    const totalCount = await prisma.post.count({ where: baseWhere });
    if (totalCount >= totalLimit) {
      throw new ApiError(429, `Total posting limit reached. Allowed ${totalLimit} post(s).`);
    }
  }

  return access;
};
