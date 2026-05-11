"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendContactEmail = exports.isContactEmailConfigured = void 0;
const env_1 = require("../../config/env");
const escapeHtml = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const isContactEmailConfigured = () => Boolean(env_1.env.smtpHost && env_1.env.smtpUser && env_1.env.smtpPass && env_1.env.smtpFrom);
exports.isContactEmailConfigured = isContactEmailConfigured;
const sendContactEmail = async (payload) => {
    if (!(0, exports.isContactEmailConfigured)()) {
        throw new Error("SMTP is not configured.");
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
        host: env_1.env.smtpHost,
        port: env_1.env.smtpPort,
        secure: env_1.env.smtpPort === 465,
        auth: {
            user: env_1.env.smtpUser,
            pass: env_1.env.smtpPass,
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
        .map(([label, value]) => `<tr><td style="padding:6px 12px;font-weight:600;border-bottom:1px solid #e5e7eb">${escapeHtml(label)}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(value)}</td></tr>`)
        .join("");
    await transporter.sendMail({
        from: env_1.env.smtpFrom,
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
        <div style="white-space:pre-wrap;border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f9fafb">${escapeHtml(payload.message)}</div>
      </div>
    `,
    });
};
exports.sendContactEmail = sendContactEmail;
