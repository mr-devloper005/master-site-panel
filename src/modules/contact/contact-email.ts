import { env } from "../../config/env";

type ContactEmailPayload = {
  to: string;
  cc?: string[];
  siteName: string;
  siteCode: string;
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  sourceUrl?: string | null;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const isContactEmailConfigured = (): boolean =>
  Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.smtpFrom);

export const sendContactEmail = async (payload: ContactEmailPayload): Promise<void> => {
  if (!isContactEmailConfigured()) {
    throw new Error("SMTP is not configured.");
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodemailer = require("nodemailer") as {
    createTransport: (options: Record<string, unknown>) => {
      sendMail: (message: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  const subject = payload.subject?.trim() || `New contact request from ${payload.siteName}`;
  const replyTo = `${payload.name} <${payload.email}>`;
  const lines = [
    ["Site", `${payload.siteName} (${payload.siteCode})`],
    ["Name", payload.name],
    ["Email", payload.email],
    ["Phone", payload.phone || "-"],
    ["Subject", subject],
    ["Source URL", payload.sourceUrl || "-"],
  ];

  const htmlRows = lines
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;font-weight:600;border-bottom:1px solid #e5e7eb">${escapeHtml(
          label
        )}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  await transporter.sendMail({
    from: env.smtpFrom,
    to: payload.to,
    cc: payload.cc?.length ? payload.cc : undefined,
    replyTo,
    subject: `[${payload.siteName}] ${subject}`,
    text: [
      `New contact request from ${payload.siteName}`,
      "",
      ...lines.map(([label, value]) => `${label}: ${value}`),
      "",
      "Message:",
      payload.message,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">New contact request</h2>
        <table style="border-collapse:collapse;margin-bottom:16px">${htmlRows}</table>
        <h3 style="margin:16px 0 8px">Message</h3>
        <div style="white-space:pre-wrap;border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f9fafb">${escapeHtml(
          payload.message
        )}</div>
      </div>
    `,
  });
};
