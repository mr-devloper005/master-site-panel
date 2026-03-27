import { Prisma } from "@prisma/client";
import { Router } from "express";
import { SiteCategory, SiteFramework } from "@prisma/client";

import { prisma } from "../../config/db";
import { requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { createApiKeyWithPermissions } from "../auth/api-key-service";
import { getLatestRuntimeStatusMap, getRuntimeStatusesForSite } from "../runtime/runtime-store";
import { getBaseUrl } from "../../utils/base-url";
import { buildTaskProvisioningGuide } from "./task-catalog";
import {
  runDueIndexingInspections,
  submitSiteSitemapForIndexing,
  updateSitemapSubmissionForSite,
} from "./google-indexing";
import { buildSiteBlueprint, isSiteTask, sanitizeSiteConfig, type SiteTask } from "./site-contract";

const router = Router();
const backendBaseUrl = () => getBaseUrl();
const SITEMAP_TIMEOUT_MS = 8000;
const SEO_TIMEOUT_MS = 9000;
const LINK_HEALTH_TIMEOUT_MS = 15000;

const normalizeTaskValue = (value?: string | string[] | null): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized === "blog-commenting" || normalized === "blog_commenting") {
    return "comment";
  }
  return normalized;
};

const firstQueryValue = (value?: unknown): string => {
  if (Array.isArray(value)) return String(value[0] || "");
  if (typeof value === "string") return value;
  return "";
};

const provisionTaskToken = async (site: { id: string; code: string }, task: SiteTask) => {
  const taskKey = await createApiKeyWithPermissions({
    name: `${site.code}-${task}-publisher`,
    task,
    siteIds: [site.id],
    canPost: true,
    canRead: true,
  });

  const guide = buildTaskProvisioningGuide(task, site.code, backendBaseUrl());

  return {
    ...guide,
    key: taskKey,
    token: taskKey.rawApiKey,
  };
};

const extractSitemapUrls = (xml: string): string[] =>
  [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

const parseHost = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

const normalizeAbsoluteUrlList = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  return Array.from(
    new Set(
      items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => /^https?:\/\//i.test(item))
    )
  );
};

const hasTag = (html: string, pattern: RegExp) => pattern.test(html);

const inspectSeoTags = (html: string, options?: { articleDetail?: boolean }) => {
  const checks: Record<string, boolean> = {
    metaDescription: hasTag(
      html,
      /<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i
    ),
    canonical: hasTag(
      html,
      /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]*href=["'][^"']+["'][^>]*>/i
    ),
    robotsMeta: hasTag(
      html,
      /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*(index|follow)[^"']*["'][^>]*>/i
    ),
    viewport: hasTag(
      html,
      /<meta[^>]+name=["']viewport["'][^>]*content=["'][^"']+["'][^>]*>/i
    ),
    ogTitle: hasTag(
      html,
      /<meta[^>]+property=["']og:title["'][^>]*content=["'][^"']+["'][^>]*>/i
    ),
    ogDescription: hasTag(
      html,
      /<meta[^>]+property=["']og:description["'][^>]*content=["'][^"']+["'][^>]*>/i
    ),
    ogImage: hasTag(
      html,
      /<meta[^>]+property=["']og:image["'][^>]*content=["'][^"']+["'][^>]*>/i
    ),
    ogUrl: hasTag(
      html,
      /<meta[^>]+property=["']og:url["'][^>]*content=["'][^"']+["'][^>]*>/i
    ),
    twitterCard: hasTag(
      html,
      /<meta[^>]+name=["']twitter:card["'][^>]*content=["'][^"']+["'][^>]*>/i
    ),
    jsonLd: hasTag(
      html,
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i
    ),
    h1: hasTag(html, /<h1[^>]*>[\s\S]*?<\/h1>/i),
  };

  if (options?.articleDetail) {
    checks.author = hasTag(
      html,
      /(<meta[^>]+name=["']author["'][^>]*content=["'][^"']+["'][^>]*>)|(<span[^>]*>[^<]*by[^<]*<\/span>)/i
    );
    checks.publishDate = hasTag(
      html,
      /(<meta[^>]+property=["']article:published_time["'][^>]*>)|(<time[^>]*datetime=["'][^"']+["'][^>]*>)/i
    );
    checks.category = hasTag(html, /(category|badge|tag)/i);
    checks.tags = hasTag(html, /(tags?|badge|tag)/i);
    checks.featuredImage = checks.ogImage;
  }

  const missing = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return { checks, missing };
};

const fetchTextWithTimeout = async (url: string, accept: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: accept },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.text();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
};

const parsePositiveInt = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

router.get("/", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const search = req.query.search?.toString().trim();
  const framework = req.query.framework?.toString();
  const category = req.query.category?.toString();
  const isActive = req.query.isActive?.toString();
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);

  const where: Prisma.SiteWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }
  if (framework && framework in SiteFramework) {
    where.framework = framework as SiteFramework;
  }
  if (category && category in SiteCategory) {
    where.category = category as SiteCategory;
  }
  if (isActive === "true" || isActive === "false") {
    where.isActive = isActive === "true";
  }

  const sites = await prisma.site.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      _count: {
        select: { posts: true },
      },
    },
  });
  const total = await prisma.site.count({ where });
  const runtimeMap = await getLatestRuntimeStatusMap(sites.map((site) => site.id));

  res.json({
    success: true,
    data: sites.map((site) => ({
      ...site,
      runtimeStatuses: runtimeMap.get(site.id) ? [runtimeMap.get(site.id)] : [],
      config: sanitizeSiteConfig(site.config),
      blueprint: buildSiteBlueprint(site.code, site.config, {
        backendBaseUrl: backendBaseUrl(),
        includeTaskCatalog: true,
      }),
    })),
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
}));

router.get("/:siteId", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      _count: { select: { posts: true } },
      posts: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          publishedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const runtimeStatuses = await getRuntimeStatusesForSite(siteId);

  res.json({
    success: true,
    data: {
      ...site,
      runtimeStatuses,
      config: sanitizeSiteConfig(site.config),
      blueprint: buildSiteBlueprint(site.code, site.config, {
        backendBaseUrl: backendBaseUrl(),
        includeTaskCatalog: true,
      }),
    },
  });
}));

router.get("/:siteId/sitemap-status", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, code: true, name: true, config: true, isActive: true },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const config = sanitizeSiteConfig(site.config);
  const frontendUrl =
    (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
  const includeAll = req.query.all === "true";

  if (!frontendUrl) {
    throw new ApiError(400, "Site frontend URL is missing. Update site config first.");
  }

  const sitemapUrl = `${frontendUrl}/sitemap.xml`;
  const manualUrls = normalizeAbsoluteUrlList(config.sitemapManualUrls);
  const excludedUrls = normalizeAbsoluteUrlList(config.sitemapExcludedUrls);
  const siteHost = parseHost(frontendUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SITEMAP_TIMEOUT_MS);
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(sitemapUrl, {
      method: "GET",
      headers: { Accept: "application/xml,text/xml,*/*" },
      cache: "no-store",
      signal: controller.signal,
    });

    const body = await response.text();
    const urls = response.ok ? extractSitemapUrls(body) : [];
    const effectiveUrls = Array.from(
      new Set([...urls, ...manualUrls].filter((url) => !excludedUrls.includes(url)))
    );
    const mismatched = siteHost
      ? effectiveUrls.filter((url) => parseHost(url) && parseHost(url) !== siteHost)
      : [];

    res.json({
      success: true,
      data: {
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        sitemapUrl,
        checkedAt,
        reachable: response.ok,
        httpStatus: response.status,
        urlCount: effectiveUrls.length,
        sampleUrls: effectiveUrls.slice(0, 12),
        manualUrlsCount: manualUrls.length,
        excludedUrlsCount: excludedUrls.length,
        ...(includeAll ? { urls: effectiveUrls } : {}),
        hostExpected: siteHost,
        hostMismatchCount: mismatched.length,
        hostMismatchSamples: mismatched.slice(0, 5),
      },
    });
    return;
  } catch (error) {
    res.status(200).json({
      success: true,
      data: {
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        sitemapUrl,
        checkedAt,
        reachable: false,
        httpStatus: null,
        urlCount: 0,
        sampleUrls: [],
        manualUrlsCount: manualUrls.length,
        excludedUrlsCount: excludedUrls.length,
        ...(includeAll ? { urls: [] } : {}),
        hostExpected: siteHost,
        hostMismatchCount: 0,
        hostMismatchSamples: [],
        error: error instanceof Error ? error.message : "Failed to fetch sitemap.",
      },
    });
    return;
  } finally {
    clearTimeout(timeout);
  }
}));

router.get("/:siteId/sitemap-config", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, code: true, name: true, config: true },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const config = sanitizeSiteConfig(site.config);
  res.json({
    success: true,
    data: {
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
      sitemapManualUrls: normalizeAbsoluteUrlList(config.sitemapManualUrls),
      sitemapExcludedUrls: normalizeAbsoluteUrlList(config.sitemapExcludedUrls),
      frontendUrl: config.frontendUrl || config.liveUrl || config.siteUrl || null,
      updatedAt: new Date().toISOString(),
    },
  });
}));

router.patch("/:siteId/sitemap-config", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, code: true, name: true, config: true },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const currentConfig = sanitizeSiteConfig(site.config);
  const manualUrls = normalizeAbsoluteUrlList(req.body?.sitemapManualUrls ?? currentConfig.sitemapManualUrls);
  const excludedUrls = normalizeAbsoluteUrlList(req.body?.sitemapExcludedUrls ?? currentConfig.sitemapExcludedUrls);

  const nextConfig = {
    ...currentConfig,
    sitemapManualUrls: manualUrls,
    sitemapExcludedUrls: excludedUrls,
  };

  const updated = await prisma.site.update({
    where: { id: site.id },
    data: { config: nextConfig },
    select: { id: true, code: true, name: true, config: true, updatedAt: true },
  });

  res.json({
    success: true,
    data: {
      siteId: updated.id,
      siteCode: updated.code,
      siteName: updated.name,
      sitemapManualUrls: manualUrls,
      sitemapExcludedUrls: excludedUrls,
      updatedAt: updated.updatedAt,
    },
  });
}));

router.get("/:siteId/seo-status", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, code: true, name: true, config: true },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const config = sanitizeSiteConfig(site.config);
  const frontendUrl =
    (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");

  if (!frontendUrl) {
    throw new ApiError(400, "Site frontend URL is missing. Update site config first.");
  }

  const checkedAt = new Date().toISOString();
  const robotsUrl = `${frontendUrl}/robots.txt`;
  const sitemapUrl = `${frontendUrl}/sitemap.xml`;

  let robotsStatus: Record<string, unknown> = {
    url: robotsUrl,
    reachable: false,
    httpStatus: null,
    hasAllowAll: false,
    hasSitemapReference: false,
  };
  let sitemapStatus: Record<string, unknown> = {
    url: sitemapUrl,
    reachable: false,
    httpStatus: null,
    urlCount: 0,
  };
  const pageReports: Array<Record<string, unknown>> = [];
  let articleDetailUrl: string | null = null;

  try {
    const { response, body } = await fetchTextWithTimeout(
      robotsUrl,
      "text/plain,*/*",
      SEO_TIMEOUT_MS
    );
    robotsStatus = {
      ...robotsStatus,
      reachable: response.ok,
      httpStatus: response.status,
      hasAllowAll: /Allow:\s*\/\s*$/im.test(body) || /User-agent:\s*\*\s*[\s\S]*Allow:\s*\//im.test(body),
      hasSitemapReference: /Sitemap:\s*https?:\/\//im.test(body),
    };
  } catch (error) {
    robotsStatus = {
      ...robotsStatus,
      error: error instanceof Error ? error.message : "Failed to fetch robots.txt",
    };
  }

  try {
    const { response, body } = await fetchTextWithTimeout(
      sitemapUrl,
      "application/xml,text/xml,*/*",
      SEO_TIMEOUT_MS
    );
    const urls = response.ok ? extractSitemapUrls(body) : [];
    articleDetailUrl = urls.find((url) => /\/articles\/[^/]+$/i.test(url)) || null;
    sitemapStatus = {
      ...sitemapStatus,
      reachable: response.ok,
      httpStatus: response.status,
      urlCount: urls.length,
      sampleUrls: urls.slice(0, 12),
    };
  } catch (error) {
    sitemapStatus = {
      ...sitemapStatus,
      error: error instanceof Error ? error.message : "Failed to fetch sitemap.xml",
    };
  }

  const pagesToInspect: Array<{ key: string; url: string; articleDetail?: boolean }> = [
    { key: "home", url: `${frontendUrl}/` },
    { key: "articles", url: `${frontendUrl}/articles` },
  ];
  if (articleDetailUrl) {
    pagesToInspect.push({ key: "articleDetail", url: articleDetailUrl, articleDetail: true });
  }

  for (const page of pagesToInspect) {
    try {
      const { response, body } = await fetchTextWithTimeout(page.url, "text/html,*/*", SEO_TIMEOUT_MS);
      if (!response.ok) {
        pageReports.push({
          page: page.key,
          url: page.url,
          reachable: false,
          httpStatus: response.status,
          checks: {},
          missing: [],
        });
        continue;
      }

      const inspected = inspectSeoTags(body, { articleDetail: page.articleDetail });
      pageReports.push({
        page: page.key,
        url: page.url,
        reachable: true,
        httpStatus: response.status,
        checks: inspected.checks,
        missing: inspected.missing,
      });
    } catch (error) {
      pageReports.push({
        page: page.key,
        url: page.url,
        reachable: false,
        httpStatus: null,
        checks: {},
        missing: [],
        error: error instanceof Error ? error.message : "Failed to fetch page",
      });
    }
  }

  const totalChecks = pageReports.reduce((sum, item) => {
    const checks = (item.checks as Record<string, boolean>) || {};
    return sum + Object.keys(checks).length;
  }, 0);
  const passedChecks = pageReports.reduce((sum, item) => {
    const checks = (item.checks as Record<string, boolean>) || {};
    return sum + Object.values(checks).filter(Boolean).length;
  }, 0);
  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  res.json({
    success: true,
    data: {
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
      checkedAt,
      score,
      summary: {
        totalChecks,
        passedChecks,
        failedChecks: Math.max(totalChecks - passedChecks, 0),
      },
      robots: robotsStatus,
      sitemap: sitemapStatus,
      pages: pageReports,
    },
  });
}));

router.get("/:siteId/link-health", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, code: true, name: true, config: true },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const config = sanitizeSiteConfig(site.config);
  const frontendUrl =
    (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");

  if (!frontendUrl) {
    throw new ApiError(400, "Site frontend URL is missing. Update site config first.");
  }

  const limit = parsePositiveInt(firstQueryValue(req.query.limit), 120, 1, 1000);
  const maxLinks = parsePositiveInt(firstQueryValue(req.query.maxLinks), 200, 1, 1000);
  const timeoutMs = parsePositiveInt(firstQueryValue(req.query.timeoutMs), 8000, 1000, 30000);
  const concurrency = parsePositiveInt(firstQueryValue(req.query.concurrency), 6, 1, 20);

  const endpointUrl = `${frontendUrl}/api/seo/link-health?limit=${limit}&maxLinks=${maxLinks}&timeoutMs=${timeoutMs}&concurrency=${concurrency}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_HEALTH_TIMEOUT_MS);
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(endpointUrl, {
      method: "GET",
      headers: { Accept: "application/json,*/*" },
      cache: "no-store",
      signal: controller.signal,
    });
    const rawText = await response.text();
    let parsed: Record<string, unknown> | null = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    const payload = parsed && typeof parsed === "object" ? parsed : {};
    const data = (payload.data && typeof payload.data === "object"
      ? payload.data
      : null) as Record<string, unknown> | null;
    const success = Boolean(payload.success) && response.ok && Boolean(data);

    res.json({
      success: true,
      data: {
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        endpointUrl,
        checkedAt,
        reachable: response.ok,
        httpStatus: response.status,
        success,
        error: success
          ? null
          : typeof payload.message === "string"
            ? payload.message
            : !response.ok
              ? `Remote endpoint failed with status ${response.status}`
              : "Invalid link health payload from site.",
        result: data || null,
      },
    });
    return;
  } catch (error) {
    res.json({
      success: true,
      data: {
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        endpointUrl,
        checkedAt,
        reachable: false,
        httpStatus: null,
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch link health endpoint.",
        result: null,
      },
    });
    return;
  } finally {
    clearTimeout(timeout);
  }
}));

router.post("/:siteId/indexing/submit-sitemap", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, code: true, name: true, config: true },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const config = sanitizeSiteConfig(site.config);

  let result: Awaited<ReturnType<typeof submitSiteSitemapForIndexing>>;
  try {
    result = await submitSiteSitemapForIndexing(site.config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sitemap submission failed.";
    await prisma.site.update({
      where: { id: site.id },
      data: {
        config: {
          ...config,
          indexingLastSitemapSubmitAt: new Date().toISOString(),
          indexingLastSitemapSubmitStatus: "ERROR",
          indexingLastSitemapSubmitError: message,
        },
      },
    });
    throw new ApiError(400, message);
  }

  if (!result.submitted) {
    const reason = result.reason || "Sitemap could not be submitted.";
    await prisma.site.update({
      where: { id: site.id },
      data: {
        config: {
          ...config,
          indexingLastSitemapSubmitAt: new Date().toISOString(),
          indexingLastSitemapSubmitStatus: "ERROR",
          indexingLastSitemapSubmitError: reason,
        },
      },
    });
    throw new ApiError(400, reason);
  }

  await updateSitemapSubmissionForSite(site.id, new Date(result.submittedAt || new Date().toISOString()));
  await prisma.site.update({
    where: { id: site.id },
    data: {
      config: {
        ...config,
        indexingLastSitemapSubmitAt: result.submittedAt || new Date().toISOString(),
        indexingLastSitemapSubmitStatus: "SUCCESS",
        indexingLastSitemapSubmitError: "",
      },
    },
  });

  res.json({
    success: true,
    data: {
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
      ...result,
    },
  });
}));

router.post("/:siteId/indexing/run-inspections", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, code: true, name: true, config: true },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 100);
  const execution = await runDueIndexingInspections({
    siteId: site.id,
    siteConfig: site.config,
    limit,
  });

  res.json({
    success: true,
    data: {
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
      ...execution,
    },
  });
}));

router.get("/:siteId/indexing-status", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const runDue = req.query.runDue === "true";
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 10), 500);

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, code: true, name: true, config: true },
  });
  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  let autoRunResult: Record<string, unknown> | null = null;
  if (runDue) {
    autoRunResult = await runDueIndexingInspections({
      siteId: site.id,
      siteConfig: site.config,
      limit: 20,
    });
  }

  try {
    const config = sanitizeSiteConfig(site.config);
    const frontendUrl =
      (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
    if (frontendUrl) {
      const sitemapUrl = `${frontendUrl}/sitemap.xml`;
      const response = await fetch(sitemapUrl, {
        method: "GET",
        headers: { Accept: "application/xml,text/xml,*/*" },
        cache: "no-store",
      });
      if (response.ok) {
        const xml = await response.text();
        const urls = extractSitemapUrls(xml);
        if (urls.length) {
          const seenAt = new Date();
          await prisma.siteIndexingRecord.updateMany({
            where: {
              siteId: site.id,
              url: { in: urls },
              sitemapSeenAt: null,
            },
            data: {
              sitemapSeenAt: seenAt,
              sitemapSubmittedAt: seenAt,
              inspectionStatus: "DISCOVERED",
            },
          });

          await prisma.siteIndexingRecord.updateMany({
            where: {
              siteId: site.id,
              url: { in: urls },
              sitemapSubmittedAt: null,
            },
            data: {
              sitemapSubmittedAt: seenAt,
            },
          });
        }
      }
    }
  } catch (error) {
    console.warn("Failed to sync sitemap seen URLs", error);
  }

  const [
    records,
    totalRecords,
    sitemapSubmittedCount,
    discoveredCount,
    indexedCount,
    notIndexedCount,
    errorCount,
    groupedStatuses,
    publishedPostsCount,
  ] = await Promise.all([
    prisma.siteIndexingRecord.findMany({
      where: { siteId: site.id },
      include: {
        post: {
          select: {
            id: true,
            title: true,
            slug: true,
            publishedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
    }),
    prisma.siteIndexingRecord.count({ where: { siteId: site.id } }),
    prisma.siteIndexingRecord.count({
      where: { siteId: site.id, sitemapSubmittedAt: { not: null } },
    }),
    prisma.siteIndexingRecord.count({
      where: { siteId: site.id, sitemapSeenAt: { not: null } },
    }),
    prisma.siteIndexingRecord.count({
      where: { siteId: site.id, inspectionStatus: "INDEXED" },
    }),
    prisma.siteIndexingRecord.count({
      where: { siteId: site.id, inspectionStatus: "NOT_INDEXED" },
    }),
    prisma.siteIndexingRecord.count({
      where: { siteId: site.id, inspectionStatus: "ERROR" },
    }),
    prisma.siteIndexingRecord.groupBy({
      by: ["inspectionStatus"],
      where: { siteId: site.id },
      _count: { _all: true },
    }),
    prisma.post.count({
      where: { siteId: site.id, status: "PUBLISHED" },
    }),
  ]);

  const byStatus = groupedStatuses.reduce<Record<string, number>>((acc, row) => {
    acc[row.inspectionStatus] = row._count._all;
    return acc;
  }, {});

  const trackingCoverage =
    publishedPostsCount > 0
      ? Math.round((totalRecords / publishedPostsCount) * 100)
      : 0;
  const untrackedPublishedPosts = Math.max(publishedPostsCount - totalRecords, 0);
  const siteConfig = sanitizeSiteConfig(site.config);

  const summary = {
    total: totalRecords,
    sitemapSubmitted: sitemapSubmittedCount,
    discovered: discoveredCount,
    indexed: indexedCount,
    notIndexed: notIndexedCount,
    errors: errorCount,
    byStatus,
  };

  res.json({
    success: true,
    data: {
      site: {
        id: site.id,
        code: site.code,
        name: site.name,
      },
      checkedAt: new Date().toISOString(),
      autoRun: autoRunResult,
      summary,
      diagnostics: {
        publishedPosts: publishedPostsCount,
        trackedPosts: totalRecords,
        untrackedPublishedPosts,
        trackingCoveragePercent: trackingCoverage,
        googleConfigured:
          Boolean(siteConfig.googleServiceAccountEmail || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
          Boolean(siteConfig.googleServiceAccountPrivateKey || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) &&
          Boolean(siteConfig.googleSearchConsoleSiteUrl || siteConfig.searchConsoleSiteUrl || process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || siteConfig.frontendUrl || siteConfig.liveUrl || siteConfig.siteUrl),
        siteProperty:
          siteConfig.googleSearchConsoleSiteUrl ||
          siteConfig.searchConsoleSiteUrl ||
          process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ||
          siteConfig.frontendUrl ||
          siteConfig.liveUrl ||
          siteConfig.siteUrl ||
          null,
        lastSitemapSubmitAt: siteConfig.indexingLastSitemapSubmitAt || null,
        lastSitemapSubmitStatus: siteConfig.indexingLastSitemapSubmitStatus || null,
        lastSitemapSubmitError: siteConfig.indexingLastSitemapSubmitError || null,
      },
      items: records.map((item) => ({
        id: item.id,
        postId: item.postId,
        postTitle: item.post.title,
        postSlug: item.post.slug,
        url: item.url,
        publishedAt: item.post.publishedAt || item.post.createdAt,
        sitemapUrl: item.sitemapUrl,
        sitemapSubmittedAt: item.sitemapSubmittedAt,
        sitemapSeenAt: item.sitemapSeenAt,
        inspectionStatus: item.inspectionStatus,
        inspectionCoverage: item.inspectionCoverage,
        inspectionVerdict: item.inspectionVerdict,
        inspectionAttempts: item.inspectionAttempts,
        inspectionLastCheckedAt: item.inspectionLastCheckedAt,
        inspectionNextCheckAt: item.inspectionNextCheckAt,
        lastError: item.lastError,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    },
  });
}));

router.post("/", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
    const { code, name, framework, category, theme, config } = req.body;

    if (!code || !name || !framework || !category) {
      throw new ApiError(
        400,
        "code, name, framework and category are required fields."
      );
    }

    if (!(framework in SiteFramework)) {
      throw new ApiError(400, "Invalid framework value.");
    }

    if (!(category in SiteCategory)) {
      throw new ApiError(400, "Invalid category value.");
    }

    const sanitizedConfig = sanitizeSiteConfig(config);
    const created = await prisma.site.create({
      data: {
        code,
        name,
        framework,
        category,
        theme,
        config: sanitizedConfig,
      },
    });

    const requestedTasks = Array.isArray(sanitizedConfig.supportedTasks)
      ? sanitizedConfig.supportedTasks.filter(isSiteTask)
      : [];

    const taskPackages = requestedTasks.length
      ? await Promise.all(requestedTasks.map((task) => provisionTaskToken(created, task)))
      : [];

    res.status(201).json({
      success: true,
      data: {
        site: {
          ...created,
          config: sanitizeSiteConfig(created.config),
          blueprint: buildSiteBlueprint(created.code, created.config, {
            backendBaseUrl: backendBaseUrl(),
            includeTaskCatalog: true,
          }),
        },
        provisioning: {
          usage: [
            "Task tokens are required for posting. Each task has its own API endpoint and payload template.",
            requestedTasks.length
              ? `Provisioned ${requestedTasks.length} task token(s) from your selected tasks.`
              : "Add tasks from the Tasks panel to generate posting tokens.",
          ],
          tasks: taskPackages,
        },
      },
    });
}));

router.post(
  "/:siteId/permissions",
  requireApiKey("sites:write"),
  asyncHandler(async (req, res) => {
      const { siteId } = req.params;
      const resolvedSiteId = String(siteId);
      const { apiKeyId, canPost = true, canRead = true } = req.body;

      if (!apiKeyId) {
        throw new ApiError(400, "apiKeyId is required.");
      }

      const permission = await prisma.apiKeySitePermission.upsert({
        where: { apiKeyId_siteId: { apiKeyId, siteId: resolvedSiteId } },
        update: { canPost, canRead },
        create: { apiKeyId, siteId: resolvedSiteId, canPost, canRead },
      });

      res.status(201).json({ success: true, data: permission });
    })
);

router.post("/:siteId/tasks", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const task = normalizeTaskValue(req.body.task);

  if (!isSiteTask(task)) {
    throw new ApiError(400, "A valid task is required.");
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      code: true,
      name: true,
      framework: true,
      category: true,
      theme: true,
      config: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const config = sanitizeSiteConfig(site.config);
  const nextConfig = {
    ...config,
    supportedTasks: Array.from(new Set([...(config.supportedTasks || []), task])),
  };

  const updated = await prisma.site.update({
    where: { id: siteId },
    data: { config: nextConfig },
  });

  const taskPackage = await provisionTaskToken(site, task);

  res.status(201).json({
    success: true,
    data: {
      site: {
        ...updated,
        config: sanitizeSiteConfig(updated.config),
        blueprint: buildSiteBlueprint(updated.code, updated.config, {
          backendBaseUrl: backendBaseUrl(),
          includeTaskCatalog: true,
        }),
      },
      task: {
        ...taskPackage,
      },
    },
  });
}));

router.post("/:siteId/tasks/:task/issue", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const task = normalizeTaskValue(req.params.task);

  if (!isSiteTask(task)) {
    throw new ApiError(400, "A valid task is required.");
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      code: true,
      name: true,
      framework: true,
      category: true,
      theme: true,
      config: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const config = sanitizeSiteConfig(site.config);
  const nextConfig = {
    ...config,
    supportedTasks: Array.from(new Set([...(config.supportedTasks || []), task])),
  };

  const updated = await prisma.site.update({
    where: { id: siteId },
    data: { config: nextConfig },
  });

  const taskPackage = await provisionTaskToken(site, task);

  res.status(201).json({
    success: true,
    data: {
      site: {
        ...updated,
        config: sanitizeSiteConfig(updated.config),
        blueprint: buildSiteBlueprint(updated.code, updated.config, {
          backendBaseUrl: backendBaseUrl(),
          includeTaskCatalog: true,
        }),
      },
      task: {
        ...taskPackage,
      },
    },
  });
}));

router.delete("/:siteId/tasks/:task", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const task = normalizeTaskValue(req.params.task);

  if (!isSiteTask(task)) {
    throw new ApiError(400, "A valid task is required.");
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, code: true, config: true },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const config = sanitizeSiteConfig(site.config);
  const nextConfig = {
    ...config,
    supportedTasks: (config.supportedTasks || []).filter((item) => item !== task),
  };

  const updated = await prisma.site.update({
    where: { id: siteId },
    data: { config: nextConfig },
  });

  const taskScope = `task:${task}`;
  const keys = await prisma.apiKey.findMany({
    where: {
      scopes: { has: taskScope },
      permissions: { some: { siteId } },
    },
    select: { id: true },
  });
  const keyIds = keys.map((key) => key.id);

  if (keyIds.length > 0) {
    await prisma.apiKey.updateMany({
      where: { id: { in: keyIds } },
      data: { isActive: false },
    });
    await prisma.apiKeySitePermission.deleteMany({
      where: { siteId, apiKeyId: { in: keyIds } },
    });
  }

  res.json({
    success: true,
    data: {
      site: {
        ...updated,
        config: sanitizeSiteConfig(updated.config),
        blueprint: buildSiteBlueprint(updated.code, updated.config, {
          backendBaseUrl: backendBaseUrl(),
          includeTaskCatalog: true,
        }),
      },
      task,
      revokedKeys: keyIds.length,
    },
  });
}));

router.patch("/:siteId/archive", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const site = await prisma.site.update({
    where: { id: String(req.params.siteId) },
    data: { isActive: false },
  });

  res.json({ success: true, data: site });
}));

router.patch("/:siteId", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  const { name, framework, category, theme, config, isActive } = req.body;

  const updateData: Prisma.SiteUpdateInput = {};
  if (name !== undefined) updateData.name = name;
  if (theme !== undefined) updateData.theme = theme;
  if (config !== undefined) updateData.config = sanitizeSiteConfig(config);
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);
  if (framework !== undefined) {
    if (!(framework in SiteFramework)) {
      throw new ApiError(400, "Invalid framework value.");
    }
    updateData.framework = framework as SiteFramework;
  }
  if (category !== undefined) {
    if (!(category in SiteCategory)) {
      throw new ApiError(400, "Invalid category value.");
    }
    updateData.category = category as SiteCategory;
  }

  const site = await prisma.site.update({
    where: { id: siteId },
    data: updateData,
  });

  res.json({
    success: true,
    data: {
      ...site,
      config: sanitizeSiteConfig(site.config),
      blueprint: buildSiteBlueprint(site.code, site.config, {
        backendBaseUrl: backendBaseUrl(),
        includeTaskCatalog: true,
      }),
    },
  });
}));

router.get("/:siteId/blueprint", requireApiKey("sites:read"), asyncHandler(async (req, res) => {
  const site = await prisma.site.findUnique({
    where: { id: String(req.params.siteId) },
    select: {
      id: true,
      code: true,
      name: true,
      framework: true,
      category: true,
      config: true,
    },
  });

  if (!site) {
    throw new ApiError(404, "Site not found.");
  }

  const config = sanitizeSiteConfig(site.config);

  res.json({
    success: true,
    data: {
      site: {
        ...site,
        config,
      },
      blueprint: buildSiteBlueprint(site.code, site.config, {
        backendBaseUrl: backendBaseUrl(),
        includeTaskCatalog: true,
      }),
      integrationSteps: [
        "Set backend URL and site code in the frontend environment.",
        "Use the public bootstrap endpoint to hydrate site metadata and supported tasks.",
        "Use the public feed endpoint for server-rendered content pages.",
        "Use a task-specific API key from the admin panel for post creation and automation tools.",
      ],
    },
  });
}));

router.delete("/:siteId", requireApiKey("sites:write"), asyncHandler(async (req, res) => {
  const siteId = String(req.params.siteId);
  await prisma.site.delete({ where: { id: siteId } });
  res.json({ success: true, message: "Site deleted." });
}));

export default router;
