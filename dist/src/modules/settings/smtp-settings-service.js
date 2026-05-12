"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSmtpTestStatus = exports.upsertSmtpSettings = exports.getPublicSmtpSettings = exports.getResolvedSmtpSettings = exports.isValidEmail = exports.normalizeEmail = exports.decryptSmtpPassword = exports.encryptSmtpPassword = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../../config/env");
const db_1 = require("../../config/db");
const CIPHER_ALGORITHM = "aes-256-gcm";
const SMTP_SETTINGS_ID = "default";
const getCipherSecret = () => {
    const secret = process.env.SMTP_SETTINGS_SECRET ||
        process.env.API_KEY_TOKEN_EXPORT_SECRET ||
        process.env.REVALIDATE_SECRET ||
        process.env.NEXT_REVALIDATE_SECRET ||
        "master-site-panel-local-smtp-secret";
    return crypto_1.default.createHash("sha256").update(secret).digest();
};
const encryptSmtpPassword = (value) => {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv(CIPHER_ALGORITHM, getCipherSecret(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
};
exports.encryptSmtpPassword = encryptSmtpPassword;
const decryptSmtpPassword = (value) => {
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
exports.decryptSmtpPassword = decryptSmtpPassword;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (value) => {
    if (typeof value !== "string")
        return "";
    return value.trim();
};
exports.normalizeEmail = normalizeEmail;
const isValidEmail = (value) => emailPattern.test(value);
exports.isValidEmail = isValidEmail;
const getResolvedSmtpSettings = async () => {
    const dbSettings = await db_1.prisma.smtpSettings.findUnique({
        where: { id: SMTP_SETTINGS_ID },
    });
    if (dbSettings?.isEnabled) {
        const password = (0, exports.decryptSmtpPassword)(dbSettings.passwordCipher);
        if (dbSettings.host && dbSettings.username && password && dbSettings.fromEmail) {
            return {
                source: "database",
                isEnabled: dbSettings.isEnabled,
                host: dbSettings.host,
                port: dbSettings.port,
                username: dbSettings.username,
                password,
                fromEmail: dbSettings.fromEmail,
                defaultNotifyEmail: dbSettings.defaultNotifyEmail || env_1.env.contactDefaultNotifyEmail,
                secure: dbSettings.secure,
            };
        }
    }
    if (env_1.env.smtpHost && env_1.env.smtpUser && env_1.env.smtpPass && env_1.env.smtpFrom) {
        return {
            source: "environment",
            isEnabled: true,
            host: env_1.env.smtpHost,
            port: env_1.env.smtpPort,
            username: env_1.env.smtpUser,
            password: env_1.env.smtpPass,
            fromEmail: env_1.env.smtpFrom,
            defaultNotifyEmail: env_1.env.contactDefaultNotifyEmail,
            secure: env_1.env.smtpPort === 465,
        };
    }
    return null;
};
exports.getResolvedSmtpSettings = getResolvedSmtpSettings;
const getPublicSmtpSettings = async () => {
    const dbSettings = await db_1.prisma.smtpSettings.findUnique({
        where: { id: SMTP_SETTINGS_ID },
    });
    const resolved = await (0, exports.getResolvedSmtpSettings)();
    if (!dbSettings) {
        return {
            source: resolved?.source || "environment",
            configured: Boolean(resolved),
            isEnabled: resolved?.isEnabled ?? true,
            host: "",
            port: 587,
            username: "",
            fromEmail: "",
            defaultNotifyEmail: env_1.env.contactDefaultNotifyEmail || "",
            secure: false,
            hasPassword: false,
            lastTestAt: null,
            lastTestStatus: null,
            lastTestError: null,
            environmentFallbackConfigured: Boolean(env_1.env.smtpHost && env_1.env.smtpUser && env_1.env.smtpPass && env_1.env.smtpFrom),
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
        environmentFallbackConfigured: Boolean(env_1.env.smtpHost && env_1.env.smtpUser && env_1.env.smtpPass && env_1.env.smtpFrom),
    };
};
exports.getPublicSmtpSettings = getPublicSmtpSettings;
const upsertSmtpSettings = async (input) => {
    const existing = await db_1.prisma.smtpSettings.findUnique({ where: { id: SMTP_SETTINGS_ID } });
    const passwordCipher = input.password?.trim()
        ? (0, exports.encryptSmtpPassword)(input.password.trim())
        : existing?.passwordCipher || null;
    return db_1.prisma.smtpSettings.upsert({
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
exports.upsertSmtpSettings = upsertSmtpSettings;
const updateSmtpTestStatus = async (status, error) => {
    await db_1.prisma.smtpSettings.updateMany({
        where: { id: SMTP_SETTINGS_ID },
        data: {
            lastTestAt: new Date(),
            lastTestStatus: status,
            lastTestError: error ? error.slice(0, 1000) : null,
        },
    });
};
exports.updateSmtpTestStatus = updateSmtpTestStatus;
