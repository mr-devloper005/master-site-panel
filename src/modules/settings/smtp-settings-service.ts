import crypto from "crypto";

import { env } from "../../config/env";
import { prisma } from "../../config/db";

const CIPHER_ALGORITHM = "aes-256-gcm";
const SMTP_SETTINGS_ID = "default";

export type ResolvedSmtpSettings = {
  source: "database" | "environment";
  isEnabled: boolean;
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  defaultNotifyEmail: string;
  secure: boolean;
};

const getCipherSecret = (): Buffer => {
  const secret =
    process.env.SMTP_SETTINGS_SECRET ||
    process.env.API_KEY_TOKEN_EXPORT_SECRET ||
    process.env.REVALIDATE_SECRET ||
    process.env.NEXT_REVALIDATE_SECRET ||
    "master-site-panel-local-smtp-secret";

  return crypto.createHash("sha256").update(secret).digest();
};

export const encryptSmtpPassword = (value: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, getCipherSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
};

export const decryptSmtpPassword = (value?: string | null): string => {
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const isValidEmail = (value: string): boolean => emailPattern.test(value);

export const getResolvedSmtpSettings = async (): Promise<ResolvedSmtpSettings | null> => {
  const dbSettings = await prisma.smtpSettings.findUnique({
    where: { id: SMTP_SETTINGS_ID },
  });

  if (dbSettings?.isEnabled) {
    const password = decryptSmtpPassword(dbSettings.passwordCipher);
    if (dbSettings.host && dbSettings.username && password && dbSettings.fromEmail) {
      return {
        source: "database",
        isEnabled: dbSettings.isEnabled,
        host: dbSettings.host,
        port: dbSettings.port,
        username: dbSettings.username,
        password,
        fromEmail: dbSettings.fromEmail,
        defaultNotifyEmail: dbSettings.defaultNotifyEmail || env.contactDefaultNotifyEmail,
        secure: dbSettings.secure,
      };
    }
  }

  if (env.smtpHost && env.smtpUser && env.smtpPass && env.smtpFrom) {
    return {
      source: "environment",
      isEnabled: true,
      host: env.smtpHost,
      port: env.smtpPort,
      username: env.smtpUser,
      password: env.smtpPass,
      fromEmail: env.smtpFrom,
      defaultNotifyEmail: env.contactDefaultNotifyEmail,
      secure: env.smtpPort === 465,
    };
  }

  return null;
};

export const getPublicSmtpSettings = async () => {
  const dbSettings = await prisma.smtpSettings.findUnique({
    where: { id: SMTP_SETTINGS_ID },
  });
  const resolved = await getResolvedSmtpSettings();

  if (!dbSettings) {
    return {
      source: resolved?.source || "environment",
      configured: Boolean(resolved),
      isEnabled: resolved?.isEnabled ?? true,
      host: "",
      port: 587,
      username: "",
      fromEmail: "",
      defaultNotifyEmail: env.contactDefaultNotifyEmail || "",
      secure: false,
      hasPassword: false,
      lastTestAt: null,
      lastTestStatus: null,
      lastTestError: null,
      environmentFallbackConfigured: Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.smtpFrom),
    };
  }

  return {
    source: "database",
    configured: Boolean(resolved),
    isEnabled: dbSettings.isEnabled,
    host: dbSettings.host,
    port: dbSettings.port,
    username: dbSettings.username,
    fromEmail: dbSettings.fromEmail,
    defaultNotifyEmail: dbSettings.defaultNotifyEmail || "",
    secure: dbSettings.secure,
    hasPassword: Boolean(dbSettings.passwordCipher),
    lastTestAt: dbSettings.lastTestAt,
    lastTestStatus: dbSettings.lastTestStatus,
    lastTestError: dbSettings.lastTestError,
    environmentFallbackConfigured: Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.smtpFrom),
  };
};

export const upsertSmtpSettings = async (input: {
  host: string;
  port: number;
  username: string;
  password?: string;
  fromEmail: string;
  defaultNotifyEmail?: string;
  secure?: boolean;
  isEnabled?: boolean;
}) => {
  const existing = await prisma.smtpSettings.findUnique({ where: { id: SMTP_SETTINGS_ID } });
  const passwordCipher = input.password?.trim()
    ? encryptSmtpPassword(input.password.trim())
    : existing?.passwordCipher || null;

  return prisma.smtpSettings.upsert({
    where: { id: SMTP_SETTINGS_ID },
    create: {
      id: SMTP_SETTINGS_ID,
      host: input.host,
      port: input.port,
      username: input.username,
      passwordCipher,
      fromEmail: input.fromEmail,
      defaultNotifyEmail: input.defaultNotifyEmail || null,
      secure: Boolean(input.secure),
      isEnabled: input.isEnabled !== false,
    },
    update: {
      host: input.host,
      port: input.port,
      username: input.username,
      passwordCipher,
      fromEmail: input.fromEmail,
      defaultNotifyEmail: input.defaultNotifyEmail || null,
      secure: Boolean(input.secure),
      isEnabled: input.isEnabled !== false,
    },
  });
};

export const updateSmtpTestStatus = async (status: "SUCCESS" | "ERROR", error?: string) => {
  await prisma.smtpSettings.updateMany({
    where: { id: SMTP_SETTINGS_ID },
    data: {
      lastTestAt: new Date(),
      lastTestStatus: status,
      lastTestError: error ? error.slice(0, 1000) : null,
    },
  });
};
