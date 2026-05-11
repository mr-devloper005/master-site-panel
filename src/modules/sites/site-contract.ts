import { buildTaskCatalog } from "./task-catalog";

export const SITE_TASKS = [
  "listing",
  "article",
  "image",
  "mediaDistribution",
  "profile",
  "classified",
  "social",
  "sbm",
  "comment",
  "pdf",
  "org",
] as const;

export type SiteTask = (typeof SITE_TASKS)[number];

export type SiteConnectorConfig = {
  frontendUrl?: string;
  liveUrl?: string;
  siteUrl?: string;
  indexNowEnabled?: boolean;
  indexNowHost?: string;
  indexNowKey?: string;
  indexNowKeyLocation?: string;
  indexNowEndpoint?: string;
  indexNowLastSubmittedAt?: string;
  indexNowLastSubmittedCount?: number;
  indexNowLastStatus?: "SUCCESS" | "ERROR";
  indexNowLastError?: string;
  searchConsoleSiteUrl?: string;
  googleSearchConsoleSiteUrl?: string;
  googleServiceAccountEmail?: string;
  googleServiceAccountPrivateKey?: string;
  siteType?: string;
  feedPath?: string;
  bootstrapPath?: string;
  sitemapManualUrls?: string[];
  sitemapExcludedUrls?: string[];
  indexingLastSitemapSubmitAt?: string;
  indexingLastSitemapSubmitStatus?: "SUCCESS" | "ERROR";
  indexingLastSitemapSubmitError?: string;
  connectorVersion?: string;
  supportedTasks?: SiteTask[];
  taskViews?: Partial<Record<SiteTask, string>>;
  metrics?: string[];
  description?: string;
  contact?: {
    enabled?: boolean;
    notifyEmail?: string;
    ccEmails?: string[];
    fromName?: string;
  };
  seoDefaults?: {
    defaultTitle?: string;
    titleTemplate?: string;
    defaultDescription?: string;
    defaultOgImage?: string;
    keywords?: string[];
  };
  seoPages?: Record<
    string,
    {
      title?: string;
      description?: string;
      canonical?: string;
      ogImage?: string;
      keywords?: string[];
      robotsIndex?: boolean;
      robotsFollow?: boolean;
    }
  >;
  seoBlueprint?: {
    urlStructure?: {
      enforceLowercase?: boolean;
      enforceHyphenatedSlugs?: boolean;
      maxSlugLength?: number;
    };
    headingPolicy?: {
      requireSingleH1?: boolean;
      minH2Count?: number;
      allowH3Plus?: boolean;
    };
    imagePolicy?: {
      requireAltText?: boolean;
      minAltLength?: number;
      enforceLazyLoading?: boolean;
      enforceWidthHeight?: boolean;
    };
    internalLinkPolicy?: {
      minInternalLinksPerPage?: number;
      descriptiveAnchorMinWords?: number;
      enforceRelatedBlock?: boolean;
    };
    schemaPolicy?: {
      enabledTypes?: string[];
      requireBreadcrumbOnDetail?: boolean;
      requireArticleSchemaOnArticles?: boolean;
      requireImageObjectForImagePosts?: boolean;
    };
    defaults?: {
      robotsIndex?: boolean;
      robotsFollow?: boolean;
      hreflangDefault?: string;
      authorFallback?: string;
    };
    pageTemplates?: Record<
      string,
      {
        titleTemplate?: string;
        descriptionTemplate?: string;
        h1Template?: string;
        canonical?: string;
        schemaTypes?: string[];
        minInternalLinks?: number;
        imageAltTemplate?: string;
        robotsIndex?: boolean;
        robotsFollow?: boolean;
      }
    >;
  };
  seoUpdatedAt?: string;
};

export const DEFAULT_CONNECTOR_VERSION = "2026-03-connector-v1";

export const isSiteTask = (value: unknown): value is SiteTask =>
  typeof value === "string" && SITE_TASKS.includes(value as SiteTask);

export const normalizeBaseUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
};

export const sanitizeSiteConfig = (value: unknown): SiteConnectorConfig => {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const supportedTasks = Array.isArray(source.supportedTasks)
    ? source.supportedTasks.filter(isSiteTask)
    : [];

  const taskViews = Object.fromEntries(
    Object.entries(
      source.taskViews && typeof source.taskViews === "object" && !Array.isArray(source.taskViews)
        ? (source.taskViews as Record<string, unknown>)
        : {}
    ).filter(([task, path]) => isSiteTask(task) && typeof path === "string" && path.trim())
  ) as Partial<Record<SiteTask, string>>;

  const metrics = Array.isArray(source.metrics)
    ? source.metrics.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const rawContact =
    source.contact && typeof source.contact === "object" && !Array.isArray(source.contact)
      ? (source.contact as Record<string, unknown>)
      : {};

  const contactCcEmails = Array.isArray(rawContact.ccEmails)
    ? rawContact.ccEmails
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
        .slice(0, 10)
    : [];

  const contactNotifyEmail =
    typeof rawContact.notifyEmail === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawContact.notifyEmail.trim())
      ? rawContact.notifyEmail.trim().toLowerCase()
      : undefined;

  const contactFromName =
    typeof rawContact.fromName === "string" && rawContact.fromName.trim()
      ? rawContact.fromName.trim().slice(0, 100)
      : undefined;

  const contact =
    typeof rawContact.enabled === "boolean" ||
    contactNotifyEmail ||
    contactCcEmails.length > 0 ||
    contactFromName
      ? {
          enabled: typeof rawContact.enabled === "boolean" ? rawContact.enabled : true,
          notifyEmail: contactNotifyEmail,
          ccEmails: contactCcEmails,
          fromName: contactFromName,
        }
      : undefined;

  const sitemapManualUrls = Array.isArray(source.sitemapManualUrls)
    ? source.sitemapManualUrls
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => Boolean(item) && /^https?:\/\//i.test(item))
    : [];

  const sitemapExcludedUrls = Array.isArray(source.sitemapExcludedUrls)
    ? source.sitemapExcludedUrls
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => Boolean(item) && /^https?:\/\//i.test(item))
    : [];

  const sanitizeString = (input: unknown, maxLength = 500): string | undefined => {
    if (typeof input !== "string") return undefined;
    const value = input.trim();
    if (!value) return undefined;
    return value.slice(0, maxLength);
  };

  const sanitizeKeywords = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    return Array.from(
      new Set(
        input
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 40)
      )
    );
  };

  const sanitizePositiveNumber = (
    input: unknown,
    min: number,
    max: number
  ): number | undefined => {
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) return undefined;
    const value = Math.floor(parsed);
    if (value < min || value > max) return undefined;
    return value;
  };

  const indexNowEnabled = typeof source.indexNowEnabled === "boolean" ? source.indexNowEnabled : undefined;
  const indexNowHost = sanitizeString(source.indexNowHost, 255);
  const indexNowKey = sanitizeString(source.indexNowKey, 255);
  const indexNowKeyLocation = sanitizeString(source.indexNowKeyLocation, 500);
  const indexNowEndpoint = sanitizeString(source.indexNowEndpoint, 500);
  const indexNowLastSubmittedAt = sanitizeString(source.indexNowLastSubmittedAt, 100);
  const indexNowLastStatus =
    source.indexNowLastStatus === "SUCCESS" || source.indexNowLastStatus === "ERROR"
      ? source.indexNowLastStatus
      : undefined;
  const indexNowLastError = sanitizeString(source.indexNowLastError, 1000);
  const indexNowLastSubmittedCount = sanitizePositiveNumber(source.indexNowLastSubmittedCount, 0, 100000);

  const rawSeoDefaults =
    source.seoDefaults && typeof source.seoDefaults === "object" && !Array.isArray(source.seoDefaults)
      ? (source.seoDefaults as Record<string, unknown>)
      : {};

  const seoDefaults = {
    defaultTitle: sanitizeString(rawSeoDefaults.defaultTitle, 120),
    titleTemplate: sanitizeString(rawSeoDefaults.titleTemplate, 120),
    defaultDescription: sanitizeString(rawSeoDefaults.defaultDescription, 320),
    defaultOgImage: sanitizeString(rawSeoDefaults.defaultOgImage, 500),
    keywords: sanitizeKeywords(rawSeoDefaults.keywords),
  };

  const rawSeoPages =
    source.seoPages && typeof source.seoPages === "object" && !Array.isArray(source.seoPages)
      ? (source.seoPages as Record<string, unknown>)
      : {};

  const seoPages = Object.fromEntries(
    Object.entries(rawSeoPages)
      .filter(([path, pageConfig]) => {
        if (typeof path !== "string" || !path.trim()) return false;
        return Boolean(pageConfig && typeof pageConfig === "object" && !Array.isArray(pageConfig));
      })
      .map(([path, pageConfig]) => {
        const config = pageConfig as Record<string, unknown>;
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        return [
          normalizedPath,
          {
            title: sanitizeString(config.title, 120),
            description: sanitizeString(config.description, 320),
            canonical: sanitizeString(config.canonical, 500),
            ogImage: sanitizeString(config.ogImage, 500),
            keywords: sanitizeKeywords(config.keywords),
            robotsIndex: typeof config.robotsIndex === "boolean" ? config.robotsIndex : undefined,
            robotsFollow: typeof config.robotsFollow === "boolean" ? config.robotsFollow : undefined,
          },
        ];
      })
      .slice(0, 80)
  ) as SiteConnectorConfig["seoPages"];

  const hasSeoDefaults = Boolean(
    seoDefaults.defaultTitle ||
      seoDefaults.titleTemplate ||
      seoDefaults.defaultDescription ||
      seoDefaults.defaultOgImage ||
      (seoDefaults.keywords && seoDefaults.keywords.length)
  );

  const hasSeoPages = Boolean(seoPages && Object.keys(seoPages).length);

  const rawSeoBlueprint =
    source.seoBlueprint && typeof source.seoBlueprint === "object" && !Array.isArray(source.seoBlueprint)
      ? (source.seoBlueprint as Record<string, unknown>)
      : {};

  const rawUrlStructure =
    rawSeoBlueprint.urlStructure &&
    typeof rawSeoBlueprint.urlStructure === "object" &&
    !Array.isArray(rawSeoBlueprint.urlStructure)
      ? (rawSeoBlueprint.urlStructure as Record<string, unknown>)
      : {};
  const rawHeadingPolicy =
    rawSeoBlueprint.headingPolicy &&
    typeof rawSeoBlueprint.headingPolicy === "object" &&
    !Array.isArray(rawSeoBlueprint.headingPolicy)
      ? (rawSeoBlueprint.headingPolicy as Record<string, unknown>)
      : {};
  const rawImagePolicy =
    rawSeoBlueprint.imagePolicy &&
    typeof rawSeoBlueprint.imagePolicy === "object" &&
    !Array.isArray(rawSeoBlueprint.imagePolicy)
      ? (rawSeoBlueprint.imagePolicy as Record<string, unknown>)
      : {};
  const rawInternalLinkPolicy =
    rawSeoBlueprint.internalLinkPolicy &&
    typeof rawSeoBlueprint.internalLinkPolicy === "object" &&
    !Array.isArray(rawSeoBlueprint.internalLinkPolicy)
      ? (rawSeoBlueprint.internalLinkPolicy as Record<string, unknown>)
      : {};
  const rawSchemaPolicy =
    rawSeoBlueprint.schemaPolicy &&
    typeof rawSeoBlueprint.schemaPolicy === "object" &&
    !Array.isArray(rawSeoBlueprint.schemaPolicy)
      ? (rawSeoBlueprint.schemaPolicy as Record<string, unknown>)
      : {};
  const rawDefaultsPolicy =
    rawSeoBlueprint.defaults &&
    typeof rawSeoBlueprint.defaults === "object" &&
    !Array.isArray(rawSeoBlueprint.defaults)
      ? (rawSeoBlueprint.defaults as Record<string, unknown>)
      : {};

  const sanitizeSchemaTypes = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const allow = new Set([
      "Organization",
      "WebSite",
      "Article",
      "BreadcrumbList",
      "LocalBusiness",
      "ImageObject",
      "CollectionPage",
      "ItemList",
    ]);
    return Array.from(
      new Set(
        input
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => allow.has(item))
      )
    );
  };

  const rawPageTemplates =
    rawSeoBlueprint.pageTemplates &&
    typeof rawSeoBlueprint.pageTemplates === "object" &&
    !Array.isArray(rawSeoBlueprint.pageTemplates)
      ? (rawSeoBlueprint.pageTemplates as Record<string, unknown>)
      : {};

  const pageTemplates = Object.fromEntries(
    Object.entries(rawPageTemplates)
      .filter(([path, template]) => {
        if (typeof path !== "string" || !path.trim()) return false;
        return Boolean(template && typeof template === "object" && !Array.isArray(template));
      })
      .map(([path, template]) => {
        const value = template as Record<string, unknown>;
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        return [
          normalizedPath,
          {
            titleTemplate: sanitizeString(value.titleTemplate, 180),
            descriptionTemplate: sanitizeString(value.descriptionTemplate, 400),
            h1Template: sanitizeString(value.h1Template, 180),
            canonical: sanitizeString(value.canonical, 500),
            schemaTypes: sanitizeSchemaTypes(value.schemaTypes),
            minInternalLinks: sanitizePositiveNumber(value.minInternalLinks, 0, 200),
            imageAltTemplate: sanitizeString(value.imageAltTemplate, 220),
            robotsIndex: typeof value.robotsIndex === "boolean" ? value.robotsIndex : undefined,
            robotsFollow: typeof value.robotsFollow === "boolean" ? value.robotsFollow : undefined,
          },
        ];
      })
      .slice(0, 120)
  ) as NonNullable<SiteConnectorConfig["seoBlueprint"]>["pageTemplates"];

  const seoBlueprint: NonNullable<SiteConnectorConfig["seoBlueprint"]> = {
    urlStructure: {
      enforceLowercase:
        typeof rawUrlStructure.enforceLowercase === "boolean" ? rawUrlStructure.enforceLowercase : undefined,
      enforceHyphenatedSlugs:
        typeof rawUrlStructure.enforceHyphenatedSlugs === "boolean"
          ? rawUrlStructure.enforceHyphenatedSlugs
          : undefined,
      maxSlugLength: sanitizePositiveNumber(rawUrlStructure.maxSlugLength, 20, 220),
    },
    headingPolicy: {
      requireSingleH1:
        typeof rawHeadingPolicy.requireSingleH1 === "boolean" ? rawHeadingPolicy.requireSingleH1 : undefined,
      minH2Count: sanitizePositiveNumber(rawHeadingPolicy.minH2Count, 0, 40),
      allowH3Plus: typeof rawHeadingPolicy.allowH3Plus === "boolean" ? rawHeadingPolicy.allowH3Plus : undefined,
    },
    imagePolicy: {
      requireAltText:
        typeof rawImagePolicy.requireAltText === "boolean" ? rawImagePolicy.requireAltText : undefined,
      minAltLength: sanitizePositiveNumber(rawImagePolicy.minAltLength, 0, 160),
      enforceLazyLoading:
        typeof rawImagePolicy.enforceLazyLoading === "boolean"
          ? rawImagePolicy.enforceLazyLoading
          : undefined,
      enforceWidthHeight:
        typeof rawImagePolicy.enforceWidthHeight === "boolean"
          ? rawImagePolicy.enforceWidthHeight
          : undefined,
    },
    internalLinkPolicy: {
      minInternalLinksPerPage: sanitizePositiveNumber(rawInternalLinkPolicy.minInternalLinksPerPage, 0, 50),
      descriptiveAnchorMinWords: sanitizePositiveNumber(rawInternalLinkPolicy.descriptiveAnchorMinWords, 1, 12),
      enforceRelatedBlock:
        typeof rawInternalLinkPolicy.enforceRelatedBlock === "boolean"
          ? rawInternalLinkPolicy.enforceRelatedBlock
          : undefined,
    },
    schemaPolicy: {
      enabledTypes: sanitizeSchemaTypes(rawSchemaPolicy.enabledTypes),
      requireBreadcrumbOnDetail:
        typeof rawSchemaPolicy.requireBreadcrumbOnDetail === "boolean"
          ? rawSchemaPolicy.requireBreadcrumbOnDetail
          : undefined,
      requireArticleSchemaOnArticles:
        typeof rawSchemaPolicy.requireArticleSchemaOnArticles === "boolean"
          ? rawSchemaPolicy.requireArticleSchemaOnArticles
          : undefined,
      requireImageObjectForImagePosts:
        typeof rawSchemaPolicy.requireImageObjectForImagePosts === "boolean"
          ? rawSchemaPolicy.requireImageObjectForImagePosts
          : undefined,
    },
    defaults: {
      robotsIndex: typeof rawDefaultsPolicy.robotsIndex === "boolean" ? rawDefaultsPolicy.robotsIndex : undefined,
      robotsFollow: typeof rawDefaultsPolicy.robotsFollow === "boolean" ? rawDefaultsPolicy.robotsFollow : undefined,
      hreflangDefault: sanitizeString(rawDefaultsPolicy.hreflangDefault, 16),
      authorFallback: sanitizeString(rawDefaultsPolicy.authorFallback, 100),
    },
    pageTemplates,
  };

  const hasBlueprint =
    Object.keys(pageTemplates || {}).length > 0 ||
    Object.values(seoBlueprint.urlStructure || {}).some((value) => value !== undefined) ||
    Object.values(seoBlueprint.headingPolicy || {}).some((value) => value !== undefined) ||
    Object.values(seoBlueprint.imagePolicy || {}).some((value) => value !== undefined) ||
    Object.values(seoBlueprint.internalLinkPolicy || {}).some((value) => value !== undefined) ||
    Object.values(seoBlueprint.defaults || {}).some((value) => value !== undefined) ||
    (Array.isArray(seoBlueprint.schemaPolicy?.enabledTypes) &&
      seoBlueprint.schemaPolicy?.enabledTypes.length > 0) ||
    typeof seoBlueprint.schemaPolicy?.requireBreadcrumbOnDetail === "boolean" ||
    typeof seoBlueprint.schemaPolicy?.requireArticleSchemaOnArticles === "boolean" ||
    typeof seoBlueprint.schemaPolicy?.requireImageObjectForImagePosts === "boolean";

  return {
    frontendUrl: normalizeBaseUrl(source.frontendUrl) || undefined,
    liveUrl: normalizeBaseUrl(source.liveUrl) || undefined,
    siteUrl: normalizeBaseUrl(source.siteUrl) || undefined,
    searchConsoleSiteUrl:
      typeof source.searchConsoleSiteUrl === "string" ? source.searchConsoleSiteUrl : undefined,
    googleSearchConsoleSiteUrl:
      typeof source.googleSearchConsoleSiteUrl === "string"
        ? source.googleSearchConsoleSiteUrl
        : undefined,
    googleServiceAccountEmail:
      typeof source.googleServiceAccountEmail === "string"
        ? source.googleServiceAccountEmail
        : undefined,
    googleServiceAccountPrivateKey:
      typeof source.googleServiceAccountPrivateKey === "string"
        ? source.googleServiceAccountPrivateKey
        : undefined,
    siteType: typeof source.siteType === "string" ? source.siteType : undefined,
    feedPath: typeof source.feedPath === "string" ? source.feedPath : undefined,
    bootstrapPath: typeof source.bootstrapPath === "string" ? source.bootstrapPath : undefined,
    indexNowEnabled,
    indexNowHost,
    indexNowKey,
    indexNowKeyLocation,
    indexNowEndpoint,
    indexNowLastSubmittedAt,
    indexNowLastSubmittedCount,
    indexNowLastStatus,
    indexNowLastError,
    sitemapManualUrls,
    sitemapExcludedUrls,
    indexingLastSitemapSubmitAt:
      typeof source.indexingLastSitemapSubmitAt === "string"
        ? source.indexingLastSitemapSubmitAt
        : undefined,
    indexingLastSitemapSubmitStatus:
      source.indexingLastSitemapSubmitStatus === "SUCCESS" ||
      source.indexingLastSitemapSubmitStatus === "ERROR"
        ? source.indexingLastSitemapSubmitStatus
        : undefined,
    indexingLastSitemapSubmitError:
      typeof source.indexingLastSitemapSubmitError === "string"
        ? source.indexingLastSitemapSubmitError
        : undefined,
    connectorVersion:
      typeof source.connectorVersion === "string" && source.connectorVersion.trim()
        ? source.connectorVersion
        : DEFAULT_CONNECTOR_VERSION,
    supportedTasks,
    taskViews,
    metrics,
    description: typeof source.description === "string" ? source.description : undefined,
    contact,
    seoDefaults: hasSeoDefaults ? seoDefaults : undefined,
    seoPages: hasSeoPages ? seoPages : undefined,
    seoBlueprint: hasBlueprint ? seoBlueprint : undefined,
    seoUpdatedAt: sanitizeString(source.seoUpdatedAt, 64),
  };
};

export const getSiteFrontendBaseUrl = (siteConfig: unknown): string | null => {
  const config = sanitizeSiteConfig(siteConfig);
  return config.frontendUrl || config.liveUrl || config.siteUrl || null;
};

export const buildSiteBlueprint = (
  siteCode: string,
  siteConfig: unknown,
  options?: {
    backendBaseUrl?: string | null;
    includeTaskCatalog?: boolean;
  }
) => {
  const config = sanitizeSiteConfig(siteConfig);

  return {
    connectorVersion: config.connectorVersion || DEFAULT_CONNECTOR_VERSION,
    supportedTasks: config.supportedTasks || [],
    endpoints: {
      bootstrap: `/api/v1/public/${siteCode}/bootstrap`,
      feed: `/api/v1/public/${siteCode}/feed`,
    },
    frontend: {
      baseUrl: getSiteFrontendBaseUrl(siteConfig),
      siteType: config.siteType || "generic",
      taskViews: config.taskViews || {},
      metrics: config.metrics || [],
    },
    ...(options?.includeTaskCatalog
      ? {
          taskCatalog: buildTaskCatalog(siteCode, options.backendBaseUrl),
        }
      : {}),
  };
};
