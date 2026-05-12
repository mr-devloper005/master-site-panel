"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVisitorAckEmail = exports.buildTeamNotificationEmail = exports.sendContactEmail = exports.isContactEmailConfigured = exports.escapeHtml = void 0;
const env_1 = require("../../config/env");
const escapeHtml = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
exports.escapeHtml = escapeHtml;
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
    await transporter.sendMail({
        from: payload.from || env_1.env.smtpFrom,
        to: payload.to,
        cc: payload.cc?.length ? payload.cc : undefined,
        replyTo: payload.replyTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
    });
};
exports.sendContactEmail = sendContactEmail;
const buildTeamNotificationEmail = (payload) => {
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
        .map(([label, value]) => `<tr><td style="padding:6px 12px;font-weight:600;border-bottom:1px solid #e5e7eb">${(0, exports.escapeHtml)(label)}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${(0, exports.escapeHtml)(value)}</td></tr>`)
        .join("");
    return {
        to: payload.to,
        cc: payload.cc,
        from: env_1.env.smtpFrom,
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
        <div style="white-space:pre-wrap;border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f9fafb">${(0, exports.escapeHtml)(payload.message)}</div>
      </div>
    `,
    };
};
exports.buildTeamNotificationEmail = buildTeamNotificationEmail;
const buildVisitorAckEmail = (payload) => {
    const subject = `We received your message - ${payload.siteName}`;
    const safeName = payload.name || "there";
    return {
        to: payload.to,
        from: env_1.env.smtpFrom,
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
        <p>Hi ${(0, exports.escapeHtml)(safeName)},</p>
        <p>Thanks for contacting <strong>${(0, exports.escapeHtml)(payload.siteName)}</strong>. We have received your message and our team will contact you soon if a response is needed.</p>
        ${payload.subject
            ? `<p><strong>Your subject:</strong> ${(0, exports.escapeHtml)(payload.subject)}</p>`
            : ""}
        <p style="margin-top:20px">Regards,<br/>${(0, exports.escapeHtml)(payload.siteName)} Team</p>
      </div>
    `,
    };
};
exports.buildVisitorAckEmail = buildVisitorAckEmail;
