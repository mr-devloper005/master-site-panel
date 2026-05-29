import { SiteCategory, type Site } from "@prisma/client";

import { sanitizeSiteConfig, type SiteTask } from "../sites/site-contract";

export const AI_POSTING_MAX_TARGETS = 20;
export const AI_POSTING_DEFAULT_WORD_COUNT = 600;
export const AI_POSTING_MIN_CONTENT_CHARS = 280;

export type AiPostingTargetInput = {
  siteId?: string;
  siteCode?: string;
  siteName?: string;
};

export type CrawlResult = {
  ok: boolean;
  finalUrl?: string;
  httpStatus?: number;
  html?: string;
  errorMessage?: string;
  attempts: number;
};

export type ExtractedPageData = {
  title: string;
  h1: string;
  metaDescription: string;
  logoUrl: string | null;
  contentText: string;
  hasEnoughContent: boolean;
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const GENERIC_BRAND_PATTERNS = [
  /^abc(?:\s+[\w-]+)?$/i,
  /^abc services$/i,
  /^example brand$/i,
  /^sample (brand|company|business)$/i,
  /^test (brand|company|business)$/i,
  /^demo (brand|company|business)$/i,
  /^generic (brand|company|business)$/i,
];

const looksGenericBrandName = (value: string | null | undefined) =>
  typeof value === "string" &&
  GENERIC_BRAND_PATTERNS.some((pattern) => pattern.test(value.trim()));

const resolveFallbackLabel = (brandName: string | null, title: string) => {
  const safeTitle = collapseWhitespace(title || "");
  const safeBrand = collapseWhitespace(brandName || "");
  if (safeTitle && (!safeBrand || looksGenericBrandName(safeBrand))) return safeTitle;
  if (safeBrand) return safeBrand;
  if (safeTitle) return safeTitle;
  return "this page";
};

export const inferTaskForSite = (site: Pick<Site, "category" | "config">): SiteTask | null => {
  const config = sanitizeSiteConfig(site.config);
  if (config.supportedTasks?.length === 1) return config.supportedTasks[0];
  switch (site.category) {
    case SiteCategory.ARTICLE:
      return "article";
    case SiteCategory.SBM:
      return "sbm";
    case SiteCategory.IMAGE_SHARING:
      return "image";
    case SiteCategory.LOCAL_LISTING:
      return "listing";
    case SiteCategory.MEDIA_DISTRIBUTION:
      return "mediaDistribution";
    case SiteCategory.PROFILE:
      return "profile";
    default:
      return config.supportedTasks?.[0] || null;
  }
};

export const validateAiPostingPayload = (payload: Record<string, unknown>) => {
  const targetUrl = String(payload.targetUrl || "").trim();
  const brandName = String(payload.brandName || "").trim() || null;
  const targets = Array.isArray(payload.targets) ? payload.targets as AiPostingTargetInput[] : [];

  if (!targetUrl) {
    return { ok: false as const, message: "targetUrl is required." };
  }

  try {
    const parsed = new URL(targetUrl);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return { ok: false as const, message: "Target URL is invalid." };
    }
  } catch {
    return { ok: false as const, message: "Target URL is invalid." };
  }

  if (!targets.length) {
    return { ok: false as const, message: "targets[] is required." };
  }

  if (targets.length > AI_POSTING_MAX_TARGETS) {
    return { ok: false as const, message: `Maximum ${AI_POSTING_MAX_TARGETS} targets are allowed per request.` };
  }

  const duplicateGuard = new Set<string>();
  for (const target of targets) {
    const identity = [target.siteId, target.siteCode, target.siteName].filter(Boolean).join("|").toLowerCase();
    if (!identity) {
      return { ok: false as const, message: "Each target must include siteId, siteCode, or siteName." };
    }
    if (duplicateGuard.has(identity)) {
      return { ok: false as const, message: "Duplicate sites are not allowed in targets[]." };
    }
    duplicateGuard.add(identity);
  }

  return {
    ok: true as const,
    value: {
      targetUrl,
      brandName,
      targets,
    },
  };
};

const extractTagContent = (html: string, tagName: string): string => {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const match = html.match(regex);
  return collapseWhitespace((match?.[1] || "").replace(/<[^>]+>/g, " "));
};

const extractMetaContent = (html: string, name: string): string => {
  const regex = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const match = html.match(regex);
  return collapseWhitespace(match?.[1] || "");
};

const extractLogoUrl = (html: string): string | null => {
  const ogImage = extractMetaContent(html, "og:image");
  if (ogImage) return ogImage;
  const imgMatch = html.match(/<img[^>]+(?:class|id|alt)=["'][^"']*(?:logo|brand)[^"']*["'][^>]+src=["']([^"']+)["']/i)
    || html.match(/<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id|alt)=["'][^"']*(?:logo|brand)[^"']*["']/i);
  return imgMatch?.[1] || null;
};

export const extractPageData = (html: string): ExtractedPageData => {
  const title = extractTagContent(html, "title");
  const h1 = extractTagContent(html, "h1");
  const metaDescription = extractMetaContent(html, "description");

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const contentText = collapseWhitespace(cleaned);
  return {
    title,
    h1,
    metaDescription,
    logoUrl: extractLogoUrl(html),
    contentText,
    hasEnoughContent: contentText.length >= AI_POSTING_MIN_CONTENT_CHARS,
  };
};

export const buildFallbackArticleHtml = ({
  brandName,
  targetUrl,
  title,
}: {
  brandName: string | null;
  targetUrl: string;
  title: string;
}) => {
  const label = resolveFallbackLabel(brandName, title);
  return [
    `<p>${label} gives visitors a direct overview of the page, its purpose, and the kind of information someone can expect to find.</p>`,
    `<h2>What This Page Covers</h2>`,
    `<p>This page helps introduce the topic in a simple way and can guide readers toward the main ideas, offers, or updates connected with the source.</p>`,
    `<h2>Why It May Be Helpful</h2>`,
    `<p>Even when detailed source content is limited, the page still works as a useful reference point for people who want a quick understanding before exploring more.</p>`,
    `<h2>Where To Learn More</h2>`,
    `<p>Readers who want full details can visit <a href="${targetUrl}" target="_blank" rel="noopener noreferrer">${targetUrl}</a> to explore the original source directly.</p>`,
    `<p><strong>Conclusion:</strong> ${label} offers a straightforward starting point for readers who want to review the original source and continue exploring the topic in more detail.</p>`,
  ].join("");
};
