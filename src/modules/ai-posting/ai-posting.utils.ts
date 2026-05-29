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
  const label = brandName || title || "this business";
  return [
    `<p>${label} continues to stand out by offering a clear, useful experience for customers looking for dependable information and services online.</p>`,
    `<p>This page highlights the core value of the brand in a simple way, making it easier for visitors to understand what is offered and why it matters.</p>`,
    `<p>Readers who want more details can visit <a href="${targetUrl}" target="_blank" rel="noopener noreferrer">${targetUrl}</a> to explore the original page directly.</p>`,
    `<p>Even when source details are limited, the most important takeaway is that the page provides a direct path for learning more, checking services, and understanding the business offering.</p>`,
    `<p><strong>Conclusion:</strong> If you want a quick overview and the latest details, visit the source page and explore the brand directly for updated information and next steps.</p>`,
  ].join("");
};

