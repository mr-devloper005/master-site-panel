"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRuntimeStatusesForSite = exports.getLatestRuntimeStatusMap = exports.upsertRuntimeStatus = exports.normalizeRuntimeStatus = void 0;
const client_1 = require("@prisma/client");
const db_1 = require("../../config/db");
const normalizeRuntimeStatus = (value, lastHeartbeatAt) => {
    if (value === "ONLINE" || value === "DEGRADED" || value === "OFFLINE") {
        return value;
    }
    const ageMs = Date.now() - lastHeartbeatAt.getTime();
    if (ageMs <= 120_000)
        return "ONLINE";
    if (ageMs <= 300_000)
        return "DEGRADED";
    return "OFFLINE";
};
exports.normalizeRuntimeStatus = normalizeRuntimeStatus;
const upsertRuntimeStatus = async (input) => db_1.prisma.$queryRaw(client_1.Prisma.sql `
    INSERT INTO "SiteRuntimeStatus" (
      "siteId",
      "environment",
      "status",
      "frontendUrl",
      "sdkVersion",
      "connectorVersion",
      "responseTimeMs",
      "supportedTasks",
      "capabilities",
      "meta",
      "lastError",
      "lastHeartbeatAt"
    )
    VALUES (
      ${input.siteId},
      ${input.environment},
      CAST(${input.status} AS "SiteConnectionStatus"),
      ${input.frontendUrl ?? null},
      ${input.sdkVersion ?? null},
      ${input.connectorVersion ?? null},
      ${input.responseTimeMs ?? null},
      ${input.supportedTasks},
      ${input.capabilities ? client_1.Prisma.sql `CAST(${JSON.stringify(input.capabilities)} AS jsonb)` : client_1.Prisma.sql `NULL`},
      ${input.meta ? client_1.Prisma.sql `CAST(${JSON.stringify(input.meta)} AS jsonb)` : client_1.Prisma.sql `NULL`},
      ${input.lastError ?? null},
      ${input.lastHeartbeatAt}
    )
    ON CONFLICT ("siteId", "environment")
    DO UPDATE SET
      "status" = EXCLUDED."status",
      "frontendUrl" = EXCLUDED."frontendUrl",
      "sdkVersion" = EXCLUDED."sdkVersion",
      "connectorVersion" = EXCLUDED."connectorVersion",
      "responseTimeMs" = EXCLUDED."responseTimeMs",
      "supportedTasks" = EXCLUDED."supportedTasks",
      "capabilities" = EXCLUDED."capabilities",
      "meta" = EXCLUDED."meta",
      "lastError" = EXCLUDED."lastError",
      "lastHeartbeatAt" = EXCLUDED."lastHeartbeatAt",
      "updatedAt" = NOW()
    RETURNING *
  `);
exports.upsertRuntimeStatus = upsertRuntimeStatus;
const getLatestRuntimeStatusMap = async (siteIds) => {
    if (siteIds.length === 0)
        return new Map();
    const rows = await db_1.prisma.$queryRaw(client_1.Prisma.sql `
    SELECT DISTINCT ON ("siteId") *
    FROM "SiteRuntimeStatus"
    WHERE "siteId" IN (${client_1.Prisma.join(siteIds)})
    ORDER BY "siteId", "lastHeartbeatAt" DESC
  `);
    return new Map(rows.map((row) => [row.siteId, row]));
};
exports.getLatestRuntimeStatusMap = getLatestRuntimeStatusMap;
const getRuntimeStatusesForSite = async (siteId) => db_1.prisma.$queryRaw(client_1.Prisma.sql `
    SELECT *
    FROM "SiteRuntimeStatus"
    WHERE "siteId" = ${siteId}
    ORDER BY "lastHeartbeatAt" DESC
  `);
exports.getRuntimeStatusesForSite = getRuntimeStatusesForSite;
