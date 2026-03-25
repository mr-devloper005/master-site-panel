"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDueIndexingForAllSites = exports.updateSitemapSubmissionForSite = exports.runDueIndexingInspections = exports.submitSiteSitemapForIndexing = exports.queuePostForIndexing = void 0;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const db_1 = require("../../config/db");
const site_contract_1 = require("./site-contract");
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters";
const SEARCH_CONSOLE_API = "https://www.googleapis.com/webmasters/v3";
const URL_INSPECTION_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const parsePrivateKey = (value) => {
    if (!value)
        return null;
    const normalized = value.replace(/\\n/g, "\n").trim();
    return normalized ? normalized : null;
};
const getGoogleConfig = (siteConfig) => {
    const config = (0, site_contract_1.sanitizeSiteConfig)(siteConfig);
    const frontendUrl = (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
    if (!frontendUrl)
        return null;
    const serviceAccountEmail = String(config.googleServiceAccountEmail ||
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
        "").trim();
    const privateKey = parsePrivateKey(String(config.googleServiceAccountPrivateKey || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ""));
    const siteProperty = String(config.googleSearchConsoleSiteUrl ||
        config.searchConsoleSiteUrl ||
        process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ||
        frontendUrl).trim();
    const sitemapUrl = `${frontendUrl}/sitemap.xml`;
    if (!serviceAccountEmail || !privateKey || !siteProperty)
        return null;
    return { serviceAccountEmail, privateKey, siteProperty, sitemapUrl };
};
const encodeBase64Url = (value) => Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const buildJwt = (serviceAccountEmail, privateKey) => {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
        iss: serviceAccountEmail,
        scope: SEARCH_CONSOLE_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
    };
    const unsigned = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(JSON.stringify(payload))}`;
    const signature = crypto_1.default.createSign("RSA-SHA256").update(unsigned).sign(privateKey);
    return `${unsigned}.${encodeBase64Url(signature)}`;
};
const getAccessToken = async (serviceAccountEmail, privateKey) => {
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
    const json = (await response.json());
    if (!response.ok || !json.access_token) {
        throw new Error(json.error_description || json.error || "Failed to fetch Google access token.");
    }
    return json.access_token;
};
const submitSitemap = async (accessToken, siteProperty, sitemapUrl) => {
    const endpoint = `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(siteProperty)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
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
const deriveInspectionStatus = (coverage, verdict) => {
    const coverageText = String(coverage || "").toLowerCase();
    const verdictText = String(verdict || "").toLowerCase();
    if (verdictText === "pass" || coverageText.includes("indexed")) {
        return client_1.IndexingInspectionStatus.INDEXED;
    }
    if (coverageText.includes("discovered")) {
        return client_1.IndexingInspectionStatus.DISCOVERED;
    }
    if (coverageText.includes("not indexed") || verdictText === "fail") {
        return client_1.IndexingInspectionStatus.NOT_INDEXED;
    }
    return client_1.IndexingInspectionStatus.SUBMITTED;
};
const inspectUrl = async (accessToken, inspectionUrl, siteProperty) => {
    const response = await fetch(URL_INSPECTION_API, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ inspectionUrl, siteUrl: siteProperty }),
    });
    const json = (await response.json());
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
const nextInspectionDate = (recordCreatedAt, attemptsAfterUpdate) => {
    if (attemptsAfterUpdate >= 2)
        return null;
    const target = new Date(recordCreatedAt);
    if (attemptsAfterUpdate === 0) {
        target.setHours(target.getHours() + 24);
        return target;
    }
    target.setHours(target.getHours() + 72);
    return target;
};
const queuePostForIndexing = async (params) => {
    const { siteId, postId, postUrl, siteConfig, publishedAt } = params;
    const googleConfig = getGoogleConfig(siteConfig);
    const nextCheck = nextInspectionDate(publishedAt, 0);
    await db_1.prisma.siteIndexingRecord.upsert({
        where: { siteId_postId: { siteId, postId } },
        update: {
            url: postUrl,
            sitemapUrl: googleConfig?.sitemapUrl || null,
            inspectionStatus: client_1.IndexingInspectionStatus.PENDING,
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
            inspectionStatus: client_1.IndexingInspectionStatus.PENDING,
            inspectionAttempts: 0,
            inspectionNextCheckAt: nextCheck,
        },
    });
};
exports.queuePostForIndexing = queuePostForIndexing;
const submitSiteSitemapForIndexing = async (siteConfig) => {
    const googleConfig = getGoogleConfig(siteConfig);
    if (!googleConfig) {
        return {
            submitted: false,
            reason: "Google Search Console credentials/site property are not configured.",
        };
    }
    const accessToken = await getAccessToken(googleConfig.serviceAccountEmail, googleConfig.privateKey);
    await submitSitemap(accessToken, googleConfig.siteProperty, googleConfig.sitemapUrl);
    return {
        submitted: true,
        sitemapUrl: googleConfig.sitemapUrl,
        siteProperty: googleConfig.siteProperty,
        submittedAt: new Date().toISOString(),
    };
};
exports.submitSiteSitemapForIndexing = submitSiteSitemapForIndexing;
const applyInspectionResult = async (recordId, result, now, createdAt, attemptsBeforeUpdate) => {
    const attemptsAfter = attemptsBeforeUpdate + 1;
    const nextCheck = result.status === client_1.IndexingInspectionStatus.INDEXED
        ? null
        : nextInspectionDate(createdAt, attemptsAfter);
    await db_1.prisma.siteIndexingRecord.update({
        where: { id: recordId },
        data: {
            inspectionStatus: result.status,
            inspectionCoverage: result.coverage || null,
            inspectionVerdict: result.verdict || null,
            inspectionLastCheckedAt: now,
            inspectionNextCheckAt: nextCheck,
            inspectionAttempts: attemptsAfter,
            sitemapSeenAt: result.status === client_1.IndexingInspectionStatus.DISCOVERED ||
                result.status === client_1.IndexingInspectionStatus.INDEXED
                ? now
                : undefined,
            lastError: null,
        },
    });
};
const runDueIndexingInspections = async (params) => {
    const { siteId, siteConfig, limit = 20 } = params;
    const googleConfig = getGoogleConfig(siteConfig);
    if (!googleConfig) {
        return { processed: 0, skipped: true, reason: "Google credentials/site property missing." };
    }
    const dueRecords = await db_1.prisma.siteIndexingRecord.findMany({
        where: {
            siteId,
            inspectionNextCheckAt: { lte: new Date() },
            inspectionStatus: {
                in: [
                    client_1.IndexingInspectionStatus.PENDING,
                    client_1.IndexingInspectionStatus.SUBMITTED,
                    client_1.IndexingInspectionStatus.DISCOVERED,
                    client_1.IndexingInspectionStatus.NOT_INDEXED,
                    client_1.IndexingInspectionStatus.ERROR,
                ],
            },
        },
        orderBy: { inspectionNextCheckAt: "asc" },
        take: Math.max(Math.min(limit, 100), 1),
    });
    if (!dueRecords.length) {
        return { processed: 0, skipped: true, reason: "No due inspection records." };
    }
    const accessToken = await getAccessToken(googleConfig.serviceAccountEmail, googleConfig.privateKey);
    let processed = 0;
    for (const record of dueRecords) {
        const now = new Date();
        try {
            const result = await inspectUrl(accessToken, record.url, googleConfig.siteProperty);
            await applyInspectionResult(record.id, result, now, record.createdAt, record.inspectionAttempts);
            processed += 1;
        }
        catch (error) {
            const attemptsAfter = record.inspectionAttempts + 1;
            await db_1.prisma.siteIndexingRecord.update({
                where: { id: record.id },
                data: {
                    inspectionStatus: client_1.IndexingInspectionStatus.ERROR,
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
exports.runDueIndexingInspections = runDueIndexingInspections;
const updateSitemapSubmissionForSite = async (siteId, submittedAt = new Date()) => {
    const updateData = {
        sitemapSubmittedAt: submittedAt,
        inspectionStatus: client_1.IndexingInspectionStatus.SUBMITTED,
        inspectionNextCheckAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastError: null,
    };
    await db_1.prisma.siteIndexingRecord.updateMany({
        where: { siteId },
        data: updateData,
    });
};
exports.updateSitemapSubmissionForSite = updateSitemapSubmissionForSite;
const runDueIndexingForAllSites = async (limitPerSite = 20) => {
    const now = new Date();
    const sites = await db_1.prisma.site.findMany({
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
    const results = [];
    for (const site of sites) {
        try {
            const output = await (0, exports.runDueIndexingInspections)({
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
        }
        catch (error) {
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
exports.runDueIndexingForAllSites = runDueIndexingForAllSites;
