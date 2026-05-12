import { env } from "../../config/env";

export type ContactEmailPayload = {
  to: string;
  cc?: string[];
  from?: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
};

export type ContactLeadPayload = {
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

export const escapeHtml = (value: string): string =>
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

  await transporter.sendMail({
    from: payload.from || env.smtpFrom,
    to: payload.to,
    cc: payload.cc?.length ? payload.cc : undefined,
    replyTo: payload.replyTo,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
};

export const buildTeamNotificationEmail = (payload: ContactLeadPayload): ContactEmailPayload => {
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

  return {
    to: payload.to,
    cc: payload.cc,
    from: env.smtpFrom,
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
  };
};

export const buildVisitorAckEmail = (payload: {
  to: string;
  siteName: string;
  name: string;
  subject?: string | null;
}): ContactEmailPayload => {
  const subject = `We received your message - ${payload.siteName}`;
  const safeName = payload.name || "there";
  return {
    to: payload.to,
    from: env.smtpFrom,
    subject,
    text: [
      `Hi ${safeName},`,
      "",
      `Thanks for contacting ${payload.siteName}. We have received your message and our team will contact you soon if a response is needed.`,
      "",
      payload.subject ? `Your subject: ${payload.subject}` : "",
      "",
      "Regards,",
      `${payload.siteName} Team`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="margin:0 0 12px">We received your message</h2>
        <p>Hi ${escapeHtml(safeName)},</p>
        <p>Thanks for contacting <strong>${escapeHtml(payload.siteName)}</strong>. We have received your message and our team will contact you soon if a response is needed.</p>
        ${
          payload.subject
            ? `<p><strong>Your subject:</strong> ${escapeHtml(payload.subject)}</p>`
            : ""
        }
        <p style="margin-top:20px">Regards,<br/>${escapeHtml(payload.siteName)} Team</p>
      </div>
    `,
  };
};
