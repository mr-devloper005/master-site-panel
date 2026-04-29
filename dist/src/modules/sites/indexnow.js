"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitUrlsToIndexNow = exports.getIndexNowConfig = void 0;
const db_1 = require("../../config/db");
const site_contract_1 = require("./site-contract");
const DEFAULT_INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const normalizeUrlList = (input) => {
    if (!Array.isArray(input))
        return [];
    return Array.from(new Set(input
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => /^https?:\/\//i.test(item))));
};
const getIndexNowConfig = (siteConfig) => {
    const config = (0, site_contract_1.sanitizeSiteConfig)(siteConfig);
    const frontendUrl = (config.frontendUrl || config.liveUrl || config.siteUrl || "").replace(/\/+$/, "");
    const host = String(config.indexNowHost || "").trim() || (() => {
        try {
            return frontendUrl ? new URL(frontendUrl).host : "";
        }
        catch {
            return "";
        }
    })();
    const key = String(config.indexNowKey || "").trim();
    const keyLocation = String(config.indexNowKeyLocation || "").trim();
    const endpoint = String(config.indexNowEndpoint || DEFAULT_INDEXNOW_ENDPOINT).trim();
    const enabled = config.indexNowEnabled !== false;
    if (!host || !key || !keyLocation)
        return null;
    return {
        enabled,
        host,
        key,
        keyLocation,
        endpoint: endpoint || DEFAULT_INDEXNOW_ENDPOINT,
    };
};
exports.getIndexNowConfig = getIndexNowConfig;
const submitUrlsToIndexNow = async (params) => {
    const { siteId, siteConfig } = params;
    const urls = normalizeUrlList(params.urls).slice(0, 10000);
    const config = (0, exports.getIndexNowConfig)(siteConfig);
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
    await db_1.prisma.site.update({
        where: { id: siteId },
        data: {
            config: {
                ...(0, site_contract_1.sanitizeSiteConfig)(siteConfig),
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
exports.submitUrlsToIndexNow = submitUrlsToIndexNow;
