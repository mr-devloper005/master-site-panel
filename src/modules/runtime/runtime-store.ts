import { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

export type RuntimeConnectionStatus = "ONLINE" | "DEGRADED" | "OFFLINE";

export type RuntimeRow = {
  id: string;
  siteId: string;
  environment: string;
  status: RuntimeConnectionStatus;
  frontendUrl: string | null;
  sdkVersion: string | null;
  connectorVersion: string | null;
  responseTimeMs: number | null;
  supportedTasks: string[];
  capabilities: Prisma.JsonValue | null;
  meta: Prisma.JsonValue | null;
  lastError: string | null;
  lastHeartbeatAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const normalizeRuntimeStatus = (
  value: unknown,
  lastHeartbeatAt: Date
): RuntimeConnectionStatus => {
  if (value === "ONLINE" || value === "DEGRADED" || value === "OFFLINE") {
    return value;
  }

  const ageMs = Date.now() - lastHeartbeatAt.getTime();
  if (ageMs <= 120_000) return "ONLINE";
  if (ageMs <= 300_000) return "DEGRADED";
  return "OFFLINE";
};

export const upsertRuntimeStatus = async (input: {
  siteId: string;
  environment: string;
  status: RuntimeConnectionStatus;
  frontendUrl?: string | null;
  sdkVersion?: string | null;
  connectorVersion?: string | null;
  responseTimeMs?: number | null;
  supportedTasks: string[];
  capabilities?: Prisma.JsonValue | null;
  meta?: Prisma.JsonValue | null;
  lastError?: string | null;
  lastHeartbeatAt: Date;
}): Promise<RuntimeRow[]> =>
  prisma.$queryRaw<RuntimeRow[]>(Prisma.sql`
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
      ${input.capabilities ? Prisma.sql`CAST(${JSON.stringify(input.capabilities)} AS jsonb)` : Prisma.sql`NULL`},
      ${input.meta ? Prisma.sql`CAST(${JSON.stringify(input.meta)} AS jsonb)` : Prisma.sql`NULL`},
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

export const getLatestRuntimeStatusMap = async (siteIds: string[]) => {
  if (siteIds.length === 0) return new Map<string, RuntimeRow>();

  const rows = await prisma.$queryRaw<RuntimeRow[]>(Prisma.sql`
    SELECT DISTINCT ON ("siteId") *
    FROM "SiteRuntimeStatus"
    WHERE "siteId" IN (${Prisma.join(siteIds)})
    ORDER BY "siteId", "lastHeartbeatAt" DESC
  `);

  return new Map(rows.map((row) => [row.siteId, row]));
};

export const getRuntimeStatusesForSite = async (siteId: string) =>
  prisma.$queryRaw<RuntimeRow[]>(Prisma.sql`
    SELECT *
    FROM "SiteRuntimeStatus"
    WHERE "siteId" = ${siteId}
    ORDER BY "lastHeartbeatAt" DESC
  `);
