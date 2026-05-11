import dotenv from "dotenv";

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
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

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required in environment variables.");
}
