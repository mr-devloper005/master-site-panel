"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const async_handler_1 = require("../../utils/async-handler");
const runtime_store_1 = require("./runtime-store");
const router = (0, express_1.Router)();
router.post("/heartbeat", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { siteCode, environment = "production", frontendUrl, sdkVersion, connectorVersion, responseTimeMs, supportedTasks, capabilities, meta, lastError, status, timestamp, } = req.body ?? {};
    if (!siteCode || typeof siteCode !== "string") {
        throw new api_error_1.ApiError(400, "siteCode is required.");
    }
    const site = await db_1.prisma.site.findUnique({
        where: { code: siteCode },
        select: { id: true, code: true, name: true, isActive: true },
    });
    if (!site || !site.isActive) {
        throw new api_error_1.ApiError(404, "Site not found or inactive.");
    }
    const heartbeatAt = timestamp ? new Date(timestamp) : new Date();
    const runtimes = await (0, runtime_store_1.upsertRuntimeStatus)({
        siteId: site.id,
        environment: String(environment),
        status: (0, runtime_store_1.normalizeRuntimeStatus)(status, heartbeatAt),
        frontendUrl: typeof frontendUrl === "string" ? frontendUrl : null,
        sdkVersion: typeof sdkVersion === "string" ? sdkVersion : null,
        connectorVersion: typeof connectorVersion === "string" ? connectorVersion : null,
        responseTimeMs: typeof responseTimeMs === "number" && Number.isFinite(responseTimeMs)
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
router.get("/sites/:siteId", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const siteId = String(req.params.siteId);
    const runtimes = await (0, runtime_store_1.getRuntimeStatusesForSite)(siteId);
    res.json({ success: true, data: runtimes });
}));
exports.default = router;
