import crypto from "crypto";
import { IndexingInspectionStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { sanitizeSiteConfig } from "./site-contract";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters";
const SEARCH_CONSOLE_API = "https://www.googleapis.com/webmasters/v3";
const URL_INSPECTION_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

const parsePrivateKey = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.replace(/\\n/g, "\n").trim();
  return normalized ? normalized : null;
};

type GoogleConfig = {
  serviceAccountEmail: string;
  privateKey: string;
  siteProperty: string;
  sitemapUrl: string;
};

const getGoogleConfig = (siteConfig: unknown): GoogleConfig | null => {
  const config = sanitizeSiteConfig(siteConfig);
  const frontendUrl =
    (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
  if (!frontendUrl) return null;

  const serviceAccountEmail = String(
    config.googleServiceAccountEmail ||
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
      ""
  ).trim();
  const privateKey = parsePrivateKey(
    String(config.googleServiceAccountPrivateKey || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "")
  );
  const siteProperty = String(
    config.googleSearchConsoleSiteUrl ||
      config.searchConsoleSiteUrl ||
      process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ||
      frontendUrl
  ).trim();
  const sitemapUrl = `${frontendUrl}/sitemap.xml`;

  if (!serviceAccountEmail || !privateKey || !siteProperty) return null;
  return { serviceAccountEmail, privateKey, siteProperty, sitemapUrl };
};

const encodeBase64Url = (value: Buffer | string): string =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const buildJwt = (serviceAccountEmail: string, privateKey: string): string => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountEmail,
    scope: SEARCH_CONSOLE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(
    JSON.stringify(payload)
  )}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  return `${unsigned}.${encodeBase64Url(signature)}`;
};

const getAccessToken = async (serviceAccountEmail: string, privateKey: string): Promise<string> => {
  const assertion = buildJwt(serviceAccountEmail, privateKey);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Failed to fetch Google access token.");
  }
  return json.access_token;
};

const submitSitemap = async (accessToken: string, siteProperty: string, sitemapUrl: string) => {
  const endpoint = `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(
    siteProperty
  )}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sitemap submit failed (${response.status}): ${text.slice(0, 240)}`);
  }
};

type InspectionResult = {
  status: IndexingInspectionStatus;
  coverage?: string | null;
  verdict?: string | null;
  raw?: unknown;
};

const deriveInspectionStatus = (coverage?: string | null, verdict?: string | null): IndexingInspectionStatus => {
  const coverageText = String(coverage || "").toLowerCase();
  const verdictText = String(verdict || "").toLowerCase();

  if (verdictText === "pass" || coverageText.includes("indexed")) {
    return IndexingInspectionStatus.INDEXED;
  }
  if (coverageText.includes("discovered")) {
    return IndexingInspectionStatus.DISCOVERED;
  }
  if (coverageText.includes("not indexed") || verdictText === "fail") {
    return IndexingInspectionStatus.NOT_INDEXED;
  }
  return IndexingInspectionStatus.SUBMITTED;
};

const inspectUrl = async (
  accessToken: string,
  inspectionUrl: string,
  siteProperty: string
): Promise<InspectionResult> => {
  const response = await fetch(URL_INSPECTION_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inspectionUrl, siteUrl: siteProperty }),
  });

  const json = (await response.json()) as {
    inspectionResult?: {
      indexStatusResult?: {
        coverageState?: string;
        verdict?: string;
      };
    };
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(json.error?.message || `Inspection failed with ${response.status}.`);
  }

  const coverage = json.inspectionResult?.indexStatusResult?.coverageState || null;
  const verdict = json.inspectionResult?.indexStatusResult?.verdict || null;
  return {
    status: deriveInspectionStatus(coverage, verdict),
    coverage,
    verdict,
    raw: json,
  };
};

const nextInspectionDate = (recordCreatedAt: Date, attemptsAfterUpdate: number): Date | null => {
  if (attemptsAfterUpdate >= 2) return null;
  const target = new Date(recordCreatedAt);
  if (attemptsAfterUpdate === 0) {
    target.setHours(target.getHours() + 24);
    return target;
  }
  target.setHours(target.getHours() + 72);
  return target;
};

export const queuePostForIndexing = async (params: {
  siteId: string;
  postId: string;
  postUrl: string;
  siteConfig: unknown;
  publishedAt: Date;
}) => {
  const { siteId, postId, postUrl, siteConfig, publishedAt } = params;
  const googleConfig = getGoogleConfig(siteConfig);
  const nextCheck = nextInspectionDate(publishedAt, 0);

  await prisma.siteIndexingRecord.upsert({
    where: { siteId_postId: { siteId, postId } },
    update: {
      url: postUrl,
      sitemapUrl: googleConfig?.sitemapUrl || null,
      inspectionStatus: IndexingInspectionStatus.PENDING,
      inspectionAttempts: 0,
      inspectionCoverage: null,
      inspectionVerdict: null,
      inspectionLastCheckedAt: null,
      inspectionNextCheckAt: nextCheck,
      lastError: null,
    },
    create: {
      siteId,
      postId,
      url: postUrl,
      sitemapUrl: googleConfig?.sitemapUrl || null,
      inspectionStatus: IndexingInspectionStatus.PENDING,
      inspectionAttempts: 0,
      inspectionNextCheckAt: nextCheck,
    },
  });
};

export const submitSiteSitemapForIndexing = async (siteConfig: unknown) => {
  const googleConfig = getGoogleConfig(siteConfig);
  if (!googleConfig) {
    return {
      submitted: false,
      reason: "Google Search Console credentials/site property are not configured.",
    };
  }

  const accessToken = await getAccessToken(
    googleConfig.serviceAccountEmail,
    googleConfig.privateKey
  );
  await submitSitemap(accessToken, googleConfig.siteProperty, googleConfig.sitemapUrl);
  return {
    submitted: true,
    sitemapUrl: googleConfig.sitemapUrl,
    siteProperty: googleConfig.siteProperty,
    submittedAt: new Date().toISOString(),
  };
};

const applyInspectionResult = async (recordId: string, result: InspectionResult, now: Date, createdAt: Date, attemptsBeforeUpdate: number) => {
  const attemptsAfter = attemptsBeforeUpdate + 1;
  const nextCheck =
    result.status === IndexingInspectionStatus.INDEXED
      ? null
      : nextInspectionDate(createdAt, attemptsAfter);

  await prisma.siteIndexingRecord.update({
    where: { id: recordId },
    data: {
      inspectionStatus: result.status,
      inspectionCoverage: result.coverage || null,
      inspectionVerdict: result.verdict || null,
      inspectionLastCheckedAt: now,
      inspectionNextCheckAt: nextCheck,
      inspectionAttempts: attemptsAfter,
      sitemapSeenAt:
        result.status === IndexingInspectionStatus.DISCOVERED ||
        result.status === IndexingInspectionStatus.INDEXED
          ? now
          : undefined,
      lastError: null,
    },
  });
};

export const runDueIndexingInspections = async (params: {
  siteId: string;
  siteConfig: unknown;
  limit?: number;
}) => {
  const { siteId, siteConfig, limit = 20 } = params;
  const googleConfig = getGoogleConfig(siteConfig);
  if (!googleConfig) {
    return { processed: 0, skipped: true, reason: "Google credentials/site property missing." };
  }

  const dueRecords = await prisma.siteIndexingRecord.findMany({
    where: {
      siteId,
      inspectionNextCheckAt: { lte: new Date() },
      inspectionStatus: {
        in: [
          IndexingInspectionStatus.PENDING,
          IndexingInspectionStatus.SUBMITTED,
          IndexingInspectionStatus.DISCOVERED,
          IndexingInspectionStatus.NOT_INDEXED,
          IndexingInspectionStatus.ERROR,
        ],
      },
    },
    orderBy: { inspectionNextCheckAt: "asc" },
    take: Math.max(Math.min(limit, 100), 1),
  });

  if (!dueRecords.length) {
    return { processed: 0, skipped: true, reason: "No due inspection records." };
  }

  const accessToken = await getAccessToken(
    googleConfig.serviceAccountEmail,
    googleConfig.privateKey
  );

  let processed = 0;
  for (const record of dueRecords) {
    const now = new Date();
    try {
      const result = await inspectUrl(accessToken, record.url, googleConfig.siteProperty);
      await applyInspectionResult(record.id, result, now, record.createdAt, record.inspectionAttempts);
      processed += 1;
    } catch (error) {
      const attemptsAfter = record.inspectionAttempts + 1;
      await prisma.siteIndexingRecord.update({
        where: { id: record.id },
        data: {
          inspectionStatus: IndexingInspectionStatus.ERROR,
          inspectionAttempts: attemptsAfter,
          inspectionLastCheckedAt: now,
          inspectionNextCheckAt: nextInspectionDate(record.createdAt, attemptsAfter),
          lastError: error instanceof Error ? error.message : "Inspection failed",
        },
      });
      processed += 1;
    }
  }

  return { processed, skipped: false };
};

export const updateSitemapSubmissionForSite = async (siteId: string, submittedAt = new Date()) => {
  const updateData = {
    sitemapSubmittedAt: submittedAt,
    inspectionStatus: IndexingInspectionStatus.SUBMITTED,
    inspectionNextCheckAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastError: null,
  };

  await prisma.siteIndexingRecord.updateMany({
    where: { siteId },
    data: updateData,
  });
};

export const runDueIndexingForAllSites = async (limitPerSite = 20) => {
  const now = new Date();
  const sites = await prisma.site.findMany({
    where: {
      isActive: true,
      indexingRecords: {
        some: {
          inspectionNextCheckAt: { lte: now },
        },
      },
    },
    select: {
      id: true,
      code: true,
      config: true,
    },
  });

  const results: Array<{ siteId: string; siteCode: string; processed: number; skipped?: boolean; reason?: string }> = [];
  for (const site of sites) {
    try {
      const output = await runDueIndexingInspections({
        siteId: site.id,
        siteConfig: site.config,
        limit: limitPerSite,
      });
      results.push({
        siteId: site.id,
        siteCode: site.code,
        processed: output.processed,
        skipped: output.skipped,
        reason: output.reason,
      });
    } catch (error) {
      results.push({
        siteId: site.id,
        siteCode: site.code,
        processed: 0,
        skipped: true,
        reason: error instanceof Error ? error.message : "Run failed",
      });
    }
  }

  return {
    checkedAt: now.toISOString(),
    sitesProcessed: results.length,
    totalUrlsProcessed: results.reduce((acc, item) => acc + item.processed, 0),
    results,
  };
};
