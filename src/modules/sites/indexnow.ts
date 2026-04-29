import { prisma } from "../../config/db";
import { sanitizeSiteConfig } from "./site-contract";

const DEFAULT_INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

type IndexNowConfig = {
  enabled: boolean;
  host: string;
  key: string;
  keyLocation: string;
  endpoint: string;
};

const normalizeUrlList = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => /^https?:\/\//i.test(item))
    )
  );
};

export const getIndexNowConfig = (siteConfig: unknown): IndexNowConfig | null => {
  const config = sanitizeSiteConfig(siteConfig);
  const frontendUrl = (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");

  const host = String(config.indexNowHost || "").trim() || (() => {
    try {
      return frontendUrl ? new URL(frontendUrl).host : "";
    } catch {
      return "";
    }
  })();

  const key = String(config.indexNowKey || "").trim();
  const keyLocation = String(config.indexNowKeyLocation || "").trim();
  const endpoint = String(config.indexNowEndpoint || DEFAULT_INDEXNOW_ENDPOINT).trim();
  const enabled = config.indexNowEnabled !== false;

  if (!host || !key || !keyLocation) return null;

  return {
    enabled,
    host,
    key,
    keyLocation,
    endpoint: endpoint || DEFAULT_INDEXNOW_ENDPOINT,
  };
};

export const submitUrlsToIndexNow = async (params: {
  siteId: string;
  siteConfig: unknown;
  urls: string[];
}) => {
  const { siteId, siteConfig } = params;
  const urls = normalizeUrlList(params.urls).slice(0, 10000);
  const config = getIndexNowConfig(siteConfig);

  if (!config) {
    return {
      submitted: false,
      reason: "IndexNow config missing. Add key, key file URL, and host first.",
      urls: [],
    };
  }

  if (!config.enabled) {
    return {
      submitted: false,
      reason: "IndexNow is disabled for this site.",
      urls: [],
    };
  }

  if (!urls.length) {
    return {
      submitted: false,
      reason: "No valid URLs provided for IndexNow submission.",
      urls: [],
    };
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      host: config.host,
      key: config.key,
      keyLocation: config.keyLocation,
      urlList: urls,
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`IndexNow submit failed (${response.status}): ${body.slice(0, 240)}`);
  }

  await prisma.site.update({
    where: { id: siteId },
    data: {
      config: {
        ...sanitizeSiteConfig(siteConfig),
        indexNowEnabled: true,
        indexNowHost: config.host,
        indexNowKey: config.key,
        indexNowKeyLocation: config.keyLocation,
        indexNowEndpoint: config.endpoint,
        indexNowLastSubmittedAt: new Date().toISOString(),
        indexNowLastSubmittedCount: urls.length,
        indexNowLastStatus: "SUCCESS",
        indexNowLastError: "",
      },
    },
  });

  return {
    submitted: true,
    endpoint: config.endpoint,
    host: config.host,
    keyLocation: config.keyLocation,
    submittedAt: new Date().toISOString(),
    submittedCount: urls.length,
    urls,
    raw: body,
  };
};
