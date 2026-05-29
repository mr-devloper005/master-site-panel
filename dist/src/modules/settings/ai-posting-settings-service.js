"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAiPostingTestStatus = exports.upsertAiPostingSettings = exports.getPublicAiPostingSettings = exports.getResolvedAiPostingSettings = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../../config/env");
const db_1 = require("../../config/db");
const CIPHER_ALGORITHM = "aes-256-gcm";
const AI_POSTING_SETTINGS_ID = "default";
const getCipherSecret = () => {
    const secret = process.env.AI_POSTING_SETTINGS_SECRET ||
        process.env.SMTP_SETTINGS_SECRET ||
        process.env.API_KEY_TOKEN_EXPORT_SECRET ||
        process.env.REVALIDATE_SECRET ||
        process.env.NEXT_REVALIDATE_SECRET ||
        "master-site-panel-local-ai-posting-secret";
    return crypto_1.default.createHash("sha256").update(secret).digest();
};
const encryptValue = (value) => {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv(CIPHER_ALGORITHM, getCipherSecret(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
};
const decryptValue = (value) => {
    if (!value)
        return "";
    const [ivHex, tagHex, encryptedHex] = value.split(":");
    if (!ivHex || !tagHex || !encryptedHex)
        return "";
    try {
        const decipher = crypto_1.default.createDecipheriv(CIPHER_ALGORITHM, getCipherSecret(), Buffer.from(ivHex, "hex"));
        decipher.setAuthTag(Buffer.from(tagHex, "hex"));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encryptedHex, "hex")),
            decipher.final(),
        ]);
        return decrypted.toString("utf8");
    }
    catch {
        return "";
    }
};
const normalizeApiUrl = (value) => {
    const raw = String(value || "").trim();
    return raw || env_1.env.openAiApiUrl;
};
const getResolvedAiPostingSettings = async () => {
    const dbSettings = await db_1.prisma.aiPostingSettings.findUnique({ where: { id: AI_POSTING_SETTINGS_ID } });
    if (dbSettings?.isEnabled) {
        const apiKey = decryptValue(dbSettings.apiKeyCipher);
        if (apiKey) {
            return {
                source: "database",
                isEnabled: dbSettings.isEnabled,
                model: dbSettings.model || env_1.env.aiPostingOpenAiModel,
                apiKey,
                openAiApiUrl: normalizeApiUrl(dbSettings.openAiApiUrl),
                defaultWordCount: Math.max(300, Math.min(1200, dbSettings.defaultWordCount || 600)),
                retryOn404: dbSettings.retryOn404,
                requestTimeoutMs: Math.max(3000, dbSettings.requestTimeoutMs || env_1.env.aiPostingHttpTimeoutMs),
            };
        }
    }
    if (env_1.env.openAiApiKey) {
        return {
            source: "environment",
            isEnabled: true,
            model: env_1.env.aiPostingOpenAiModel,
            apiKey: env_1.env.openAiApiKey,
            openAiApiUrl: env_1.env.openAiApiUrl,
            defaultWordCount: 600,
            retryOn404: true,
            requestTimeoutMs: Math.max(3000, env_1.env.aiPostingHttpTimeoutMs),
        };
    }
    return null;
};
exports.getResolvedAiPostingSettings = getResolvedAiPostingSettings;
const getPublicAiPostingSettings = async () => {
    const dbSettings = await db_1.prisma.aiPostingSettings.findUnique({ where: { id: AI_POSTING_SETTINGS_ID } });
    const resolved = await (0, exports.getResolvedAiPostingSettings)();
    if (!dbSettings) {
        return {
            source: resolved?.source || "environment",
            configured: Boolean(resolved?.apiKey),
            isEnabled: resolved?.isEnabled ?? true,
            model: resolved?.model || env_1.env.aiPostingOpenAiModel,
            openAiApiUrl: resolved?.openAiApiUrl || env_1.env.openAiApiUrl,
            defaultWordCount: resolved?.defaultWordCount || 600,
            retryOn404: resolved?.retryOn404 ?? true,
            requestTimeoutMs: resolved?.requestTimeoutMs || env_1.env.aiPostingHttpTimeoutMs,
            hasApiKey: Boolean(resolved?.apiKey),
            lastTestAt: null,
            lastTestStatus: null,
            lastTestError: null,
            environmentFallbackConfigured: Boolean(env_1.env.openAiApiKey),
        };
    }
    return {
        source: "database",
        configured: Boolean(resolved?.apiKey),
        isEnabled: dbSettings.isEnabled,
        model: dbSettings.model,
        openAiApiUrl: normalizeApiUrl(dbSettings.openAiApiUrl),
        defaultWordCount: dbSettings.defaultWordCount,
        retryOn404: dbSettings.retryOn404,
        requestTimeoutMs: dbSettings.requestTimeoutMs,
        hasApiKey: Boolean(dbSettings.apiKeyCipher),
        lastTestAt: dbSettings.lastTestAt,
        lastTestStatus: dbSettings.lastTestStatus,
        lastTestError: dbSettings.lastTestError,
        environmentFallbackConfigured: Boolean(env_1.env.openAiApiKey),
    };
};
exports.getPublicAiPostingSettings = getPublicAiPostingSettings;
const upsertAiPostingSettings = async (input) => {
    const existing = await db_1.prisma.aiPostingSettings.findUnique({ where: { id: AI_POSTING_SETTINGS_ID } });
    const apiKeyCipher = input.apiKey?.trim()
        ? encryptValue(input.apiKey.trim())
        : existing?.apiKeyCipher || null;
    return db_1.prisma.aiPostingSettings.upsert({
        where: { id: AI_POSTING_SETTINGS_ID },
        create: {
            id: AI_POSTING_SETTINGS_ID,
            model: input.model.trim() || env_1.env.aiPostingOpenAiModel,
            apiKeyCipher,
            openAiApiUrl: normalizeApiUrl(input.openAiApiUrl),
            defaultWordCount: Math.max(300, Math.min(1200, Number(input.defaultWordCount || 600))),
            retryOn404: input.retryOn404 !== false,
            requestTimeoutMs: Math.max(3000, Number(input.requestTimeoutMs || env_1.env.aiPostingHttpTimeoutMs)),
            isEnabled: input.isEnabled !== false,
        },
        update: {
            model: input.model.trim() || env_1.env.aiPostingOpenAiModel,
            apiKeyCipher,
            openAiApiUrl: normalizeApiUrl(input.openAiApiUrl),
            defaultWordCount: Math.max(300, Math.min(1200, Number(input.defaultWordCount || 600))),
            retryOn404: input.retryOn404 !== false,
            requestTimeoutMs: Math.max(3000, Number(input.requestTimeoutMs || env_1.env.aiPostingHttpTimeoutMs)),
            isEnabled: input.isEnabled !== false,
        },
    });
};
exports.upsertAiPostingSettings = upsertAiPostingSettings;
const updateAiPostingTestStatus = async (status, error) => {
    await db_1.prisma.aiPostingSettings.updateMany({
        where: { id: AI_POSTING_SETTINGS_ID },
        data: {
            lastTestAt: new Date(),
            lastTestStatus: status,
            lastTestError: error ? error.slice(0, 1000) : null,
        },
    });
};
exports.updateAiPostingTestStatus = updateAiPostingTestStatus;
