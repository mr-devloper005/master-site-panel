"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const async_handler_1 = require("../../utils/async-handler");
const contact_email_1 = require("../contact/contact-email");
const smtp_settings_service_1 = require("./smtp-settings-service");
const router = (0, express_1.Router)();
router.get("/smtp", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (_req, res) => {
    res.json({
        success: true,
        data: await (0, smtp_settings_service_1.getPublicSmtpSettings)(),
    });
}));
router.put("/smtp", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const host = String(req.body?.host || "").trim();
    const port = Number(req.body?.port || 587);
    const username = (0, smtp_settings_service_1.normalizeEmail)(req.body?.username);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const fromEmail = String(req.body?.fromEmail || "").trim();
    const defaultNotifyEmail = (0, smtp_settings_service_1.normalizeEmail)(req.body?.defaultNotifyEmail);
    const secure = Boolean(req.body?.secure);
    const isEnabled = req.body?.isEnabled !== false;
    if (!host)
        throw new api_error_1.ApiError(400, "SMTP host is required.");
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new api_error_1.ApiError(400, "Valid SMTP port is required.");
    }
    if (!(0, smtp_settings_service_1.isValidEmail)(username))
        throw new api_error_1.ApiError(400, "Valid SMTP username email is required.");
    if (!fromEmail)
        throw new api_error_1.ApiError(400, "SMTP from value is required.");
    if (defaultNotifyEmail && !(0, smtp_settings_service_1.isValidEmail)(defaultNotifyEmail)) {
        throw new api_error_1.ApiError(400, "Valid default notify email is required.");
    }
    await (0, smtp_settings_service_1.upsertSmtpSettings)({
        host,
        port,
        username,
        password,
        fromEmail,
        defaultNotifyEmail,
        secure,
        isEnabled,
    });
    res.json({
        success: true,
        data: await (0, smtp_settings_service_1.getPublicSmtpSettings)(),
    });
}));
router.post("/smtp/test", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const settings = await (0, smtp_settings_service_1.getPublicSmtpSettings)();
    const to = (0, smtp_settings_service_1.normalizeEmail)(req.body?.toEmail) || settings.defaultNotifyEmail || settings.username;
    if (!(0, smtp_settings_service_1.isValidEmail)(to))
        throw new api_error_1.ApiError(400, "Valid test recipient email is required.");
    try {
        await (0, contact_email_1.sendContactEmail)({
            to,
            subject: "Master Panel SMTP test",
            text: "SMTP is configured successfully. This is a test email from SiteMaster Pro.",
            html: "<p>SMTP is configured successfully.</p><p>This is a test email from <strong>SiteMaster Pro</strong>.</p>",
        });
        await (0, smtp_settings_service_1.updateSmtpTestStatus)("SUCCESS");
        res.json({ success: true, data: await (0, smtp_settings_service_1.getPublicSmtpSettings)() });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "SMTP test failed.";
        await (0, smtp_settings_service_1.updateSmtpTestStatus)("ERROR", message);
        throw new api_error_1.ApiError(502, message);
    }
}));
exports.default = router;
