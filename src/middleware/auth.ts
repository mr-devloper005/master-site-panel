import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

import { prisma } from "../config/db";
import { ApiError } from "../utils/api-error";

const hashApiKey = (rawApiKey: string): string =>
  crypto.createHash("sha256").update(rawApiKey).digest("hex");

const hasScope = (scopes: string[], required: string): boolean =>
  scopes.includes("*") || scopes.includes(required);

export const requireApiKey =
  (requiredScope: string) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const rawApiKey = req.header("x-api-key");

    if (!rawApiKey) {
      return next(new ApiError(401, "x-api-key header is required."));
    }

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(rawApiKey) },
      include: {
        user: {
          select: { id: true, status: true },
        },
      },
    });

    if (!apiKey || !apiKey.isActive) {
      return next(new ApiError(401, "Invalid or inactive API key."));
    }

    if (apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now())) {
      return next(new ApiError(401, "API key is revoked or expired."));
    }

    if (apiKey.userId && apiKey.user?.status !== "ACTIVE") {
      return next(new ApiError(403, "User is not active."));
    }

    if (!hasScope(apiKey.scopes, requiredScope)) {
      return next(new ApiError(403, `Missing scope: ${requiredScope}`));
    }

    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date(), lastUsedIp: req.ip },
    });

    req.apiKey = apiKey;
    next();
  };

export const ensureSiteAccess = async (
  apiKeyId: string,
  siteId: string,
  accessType: "post" | "read"
): Promise<boolean> => {
  const key = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { userId: true },
  });

  if (key?.userId) {
    const access = await prisma.userSiteTaskAccess.findFirst({
      where: {
        userId: key.userId,
        siteId,
        isActive: true,
        ...(accessType === "post" ? { canPost: true } : { canRead: true }),
      },
      select: { id: true },
    });
    if (access) return true;
  }

  const permission = await prisma.apiKeySitePermission.findUnique({
    where: {
      apiKeyId_siteId: { apiKeyId, siteId },
    },
  });

  if (!permission) return false;
  return accessType === "post" ? permission.canPost : permission.canRead;
};

export const getAllowedSiteIds = async (
  apiKeyId: string,
  accessType: "post" | "read"
): Promise<string[]> => {
  const key = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { userId: true },
  });

  if (key?.userId) {
    const userAccess = await prisma.userSiteTaskAccess.findMany({
      where: {
        userId: key.userId,
        isActive: true,
        ...(accessType === "post" ? { canPost: true } : { canRead: true }),
      },
      distinct: ["siteId"],
      select: { siteId: true },
    });
    return userAccess.map((permission) => permission.siteId);
  }

  const permissions = await prisma.apiKeySitePermission.findMany({
    where: accessType === "post" ? { apiKeyId, canPost: true } : { apiKeyId, canRead: true },
    select: { siteId: true },
  });

  return permissions.map((permission) => permission.siteId);
};

export { hashApiKey };
