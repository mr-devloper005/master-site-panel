"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
exports.env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: toNumber(process.env.PORT, 4000),
    databaseUrl: process.env.DATABASE_URL ?? "",
    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: toNumber(process.env.SMTP_PORT, 587),
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: process.env.SMTP_PASS ?? "",
    smtpFrom: process.env.SMTP_FROM ?? "",
    contactDefaultNotifyEmail: process.env.CONTACT_DEFAULT_NOTIFY_EMAIL ?? "",
};
if (!exports.env.databaseUrl) {
    throw new Error("DATABASE_URL is required in environment variables.");
}
