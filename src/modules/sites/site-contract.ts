export const SITE_TASKS = [
  "listing",
  "article",
  "image",
  "profile",
  "classified",
  "social",
] as const;

export type SiteTask = (typeof SITE_TASKS)[number];

export type SiteConnectorConfig = {
  frontendUrl?: string;
  liveUrl?: string;
  siteUrl?: string;
  siteType?: string;
  feedPath?: string;
  bootstrapPath?: string;
  connectorVersion?: string;
  supportedTasks?: SiteTask[];
  taskViews?: Partial<Record<SiteTask, string>>;
  metrics?: string[];
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

  return {
    frontendUrl: normalizeBaseUrl(source.frontendUrl) || undefined,
    liveUrl: normalizeBaseUrl(source.liveUrl) || undefined,
    siteUrl: normalizeBaseUrl(source.siteUrl) || undefined,
    siteType: typeof source.siteType === "string" ? source.siteType : undefined,
    feedPath: typeof source.feedPath === "string" ? source.feedPath : undefined,
    bootstrapPath: typeof source.bootstrapPath === "string" ? source.bootstrapPath : undefined,
    connectorVersion:
      typeof source.connectorVersion === "string" && source.connectorVersion.trim()
        ? source.connectorVersion
        : DEFAULT_CONNECTOR_VERSION,
    supportedTasks,
    taskViews,
    metrics,
  };
};

export const getSiteFrontendBaseUrl = (siteConfig: unknown): string | null => {
  const config = sanitizeSiteConfig(siteConfig);
  return config.frontendUrl || config.liveUrl || config.siteUrl || null;
};

export const buildSiteBlueprint = (siteCode: string, siteConfig: unknown) => {
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
  };
};
