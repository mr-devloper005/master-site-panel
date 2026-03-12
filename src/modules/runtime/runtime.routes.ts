import { Router } from "express";

import { prisma } from "../../config/db";
import { requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import {
  getRuntimeStatusesForSite,
  normalizeRuntimeStatus,
  upsertRuntimeStatus,
} from "./runtime-store";

const router = Router();

router.post("/heartbeat", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const {
    siteCode,
    environment = "production",
    frontendUrl,
    sdkVersion,
    connectorVersion,
    responseTimeMs,
    supportedTasks,
    capabilities,
    meta,
    lastError,
    status,
    timestamp,
  } = req.body ?? {};

  if (!siteCode || typeof siteCode !== "string") {
    throw new ApiError(400, "siteCode is required.");
  }

  const site = await prisma.site.findUnique({
    where: { code: siteCode },
    select: { id: true, code: true, name: true, isActive: true },
  });

  if (!site || !site.isActive) {
    throw new ApiError(404, "Site not found or inactive.");
  }

  const heartbeatAt = timestamp ? new Date(timestamp) : new Date();
  const runtimes = await upsertRuntimeStatus({
    siteId: site.id,
    environment: String(environment),
    status: normalizeRuntimeStatus(status, heartbeatAt),
    frontendUrl: typeof frontendUrl === "string" ? frontendUrl : null,
    sdkVersion: typeof sdkVersion === "string" ? sdkVersion : null,
    connectorVersion: typeof connectorVersion === "string" ? connectorVersion : null,
    responseTimeMs:
      typeof responseTimeMs === "number" && Number.isFinite(responseTimeMs)
        ? Math.max(0, Math.round(responseTimeMs))
        : null,
    supportedTasks: Array.isArray(supportedTasks)
      ? supportedTasks.map((task) => String(task))
      : [],
    capabilities: capabilities ?? null,
    meta: meta ?? null,
    lastError: typeof lastError === "string" && lastError.trim() ? lastError : null,
    lastHeartbeatAt: heartbeatAt,
  });

  res.status(201).json({
    success: true,
    data: {
      siteId: site.id,
      siteCode: site.code,
      runtime: runtimes[0] || null,
    },
  });
}));

router.get("/sites/:siteId", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const runtimes = await getRuntimeStatusesForSite(siteId);

  res.json({ success: true, data: runtimes });
}));

export default router;
