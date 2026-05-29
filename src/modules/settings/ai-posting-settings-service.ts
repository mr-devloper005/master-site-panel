import crypto from "crypto";

import { env } from "../../config/env";
import { prisma } from "../../config/db";

const CIPHER_ALGORITHM = "aes-256-gcm";
const AI_POSTING_SETTINGS_ID = "default";

export type ResolvedAiPostingSettings = {
  source: "database" | "environment";
  isEnabled: boolean;
  model: string;
  apiKey: string;
  openAiApiUrl: string;
  defaultWordCount: number;
  retryOn404: boolean;
  requestTimeoutMs: number;
};

const getCipherSecret = (): Buffer => {
  const secret =
    process.env.AI_POSTING_SETTINGS_SECRET ||
    process.env.SMTP_SETTINGS_SECRET ||
    process.env.API_KEY_TOKEN_EXPORT_SECRET ||
    process.env.REVALIDATE_SECRET ||
    process.env.NEXT_REVALIDATE_SECRET ||
    "master-site-panel-local-ai-posting-secret";

  return crypto.createHash("sha256").update(secret).digest();
};

const encryptValue = (value: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, getCipherSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
};

const decryptValue = (value?: string | null): string => {
  if (!value) return "";
  const [ivHex, tagHex, encryptedHex] = value.split(":");
  if (!ivHex || !tagHex || !encryptedHex) return "";

  try {
    const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, getCipherSecret(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
};

const normalizeApiUrl = (value?: string | null) => {
  const raw = String(value || "").trim();
  return raw || env.openAiApiUrl;
};

export const getResolvedAiPostingSettings = async (): Promise<ResolvedAiPostingSettings | null> => {
  const dbSettings = await prisma.aiPostingSettings.findUnique({ where: { id: AI_POSTING_SETTINGS_ID } });

  if (dbSettings?.isEnabled) {
    const apiKey = decryptValue(dbSettings.apiKeyCipher);
    if (apiKey) {
      return {
        source: "database",
        isEnabled: dbSettings.isEnabled,
        model: dbSettings.model || env.aiPostingOpenAiModel,
        apiKey,
        openAiApiUrl: normalizeApiUrl(dbSettings.openAiApiUrl),
        defaultWordCount: Math.max(300, Math.min(1200, dbSettings.defaultWordCount || 600)),
        retryOn404: dbSettings.retryOn404,
        requestTimeoutMs: Math.max(3000, dbSettings.requestTimeoutMs || env.aiPostingHttpTimeoutMs),
      };
    }
  }

  if (env.openAiApiKey) {
    return {
      source: "environment",
      isEnabled: true,
      model: env.aiPostingOpenAiModel,
      apiKey: env.openAiApiKey,
      openAiApiUrl: env.openAiApiUrl,
      defaultWordCount: 600,
      retryOn404: true,
      requestTimeoutMs: Math.max(3000, env.aiPostingHttpTimeoutMs),
    };
  }

  return null;
};

export const getPublicAiPostingSettings = async () => {
  const dbSettings = await prisma.aiPostingSettings.findUnique({ where: { id: AI_POSTING_SETTINGS_ID } });
  const resolved = await getResolvedAiPostingSettings();

  if (!dbSettings) {
    return {
      source: resolved?.source || "environment",
      configured: Boolean(resolved?.apiKey),
      isEnabled: resolved?.isEnabled ?? true,
      model: resolved?.model || env.aiPostingOpenAiModel,
      openAiApiUrl: resolved?.openAiApiUrl || env.openAiApiUrl,
      defaultWordCount: resolved?.defaultWordCount || 600,
      retryOn404: resolved?.retryOn404 ?? true,
      requestTimeoutMs: resolved?.requestTimeoutMs || env.aiPostingHttpTimeoutMs,
      hasApiKey: Boolean(resolved?.apiKey),
      lastTestAt: null,
      lastTestStatus: null,
      lastTestError: null,
      environmentFallbackConfigured: Boolean(env.openAiApiKey),
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
    environmentFallbackConfigured: Boolean(env.openAiApiKey),
  };
};

export const upsertAiPostingSettings = async (input: {
  model: string;
  apiKey?: string;
  openAiApiUrl?: string;
  defaultWordCount?: number;
  retryOn404?: boolean;
  requestTimeoutMs?: number;
  isEnabled?: boolean;
}) => {
  const existing = await prisma.aiPostingSettings.findUnique({ where: { id: AI_POSTING_SETTINGS_ID } });
  const apiKeyCipher = input.apiKey?.trim()
    ? encryptValue(input.apiKey.trim())
    : existing?.apiKeyCipher || null;

  return prisma.aiPostingSettings.upsert({
    where: { id: AI_POSTING_SETTINGS_ID },
    create: {
      id: AI_POSTING_SETTINGS_ID,
      model: input.model.trim() || env.aiPostingOpenAiModel,
      apiKeyCipher,
      openAiApiUrl: normalizeApiUrl(input.openAiApiUrl),
      defaultWordCount: Math.max(300, Math.min(1200, Number(input.defaultWordCount || 600))),
      retryOn404: input.retryOn404 !== false,
      requestTimeoutMs: Math.max(3000, Number(input.requestTimeoutMs || env.aiPostingHttpTimeoutMs)),
      isEnabled: input.isEnabled !== false,
    },
    update: {
      model: input.model.trim() || env.aiPostingOpenAiModel,
      apiKeyCipher,
      openAiApiUrl: normalizeApiUrl(input.openAiApiUrl),
      defaultWordCount: Math.max(300, Math.min(1200, Number(input.defaultWordCount || 600))),
      retryOn404: input.retryOn404 !== false,
      requestTimeoutMs: Math.max(3000, Number(input.requestTimeoutMs || env.aiPostingHttpTimeoutMs)),
      isEnabled: input.isEnabled !== false,
    },
  });
};

export const updateAiPostingTestStatus = async (status: "SUCCESS" | "ERROR", error?: string) => {
  await prisma.aiPostingSettings.updateMany({
    where: { id: AI_POSTING_SETTINGS_ID },
    data: {
      lastTestAt: new Date(),
      lastTestStatus: status,
      lastTestError: error ? error.slice(0, 1000) : null,
    },
  });
};
