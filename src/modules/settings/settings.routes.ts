import { Router } from "express";

import { requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { sendContactEmail } from "../contact/contact-email";
import {
  getPublicSmtpSettings,
  isValidEmail,
  normalizeEmail,
  updateSmtpTestStatus,
  upsertSmtpSettings,
} from "./smtp-settings-service";

const router = Router();

router.get(
  "/smtp",
  requireApiKey("sites:read"),
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await getPublicSmtpSettings(),
    });
  })
);

router.put(
  "/smtp",
  requireApiKey("sites:write"),
  asyncHandler(async (req, res) => {
    const host = String(req.body?.host || "").trim();
    const port = Number(req.body?.port || 587);
    const username = normalizeEmail(req.body?.username);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const fromEmail = String(req.body?.fromEmail || "").trim();
    const defaultNotifyEmail = normalizeEmail(req.body?.defaultNotifyEmail);
    const secure = Boolean(req.body?.secure);
    const isEnabled = req.body?.isEnabled !== false;

    if (!host) throw new ApiError(400, "SMTP host is required.");
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new ApiError(400, "Valid SMTP port is required.");
    }
    if (!isValidEmail(username)) throw new ApiError(400, "Valid SMTP username email is required.");
    if (!fromEmail) throw new ApiError(400, "SMTP from value is required.");
    if (defaultNotifyEmail && !isValidEmail(defaultNotifyEmail)) {
      throw new ApiError(400, "Valid default notify email is required.");
    }

    await upsertSmtpSettings({
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
      data: await getPublicSmtpSettings(),
    });
  })
);

router.post(
  "/smtp/test",
  requireApiKey("sites:write"),
  asyncHandler(async (req, res) => {
    const settings = await getPublicSmtpSettings();
    const to = normalizeEmail(req.body?.toEmail) || settings.defaultNotifyEmail || settings.username;
    if (!isValidEmail(to)) throw new ApiError(400, "Valid test recipient email is required.");

    try {
      await sendContactEmail({
        to,
        subject: "Master Panel SMTP test",
        text: "SMTP is configured successfully. This is a test email from SiteMaster Pro.",
        html: "<p>SMTP is configured successfully.</p><p>This is a test email from <strong>SiteMaster Pro</strong>.</p>",
      });
      await updateSmtpTestStatus("SUCCESS");
      res.json({ success: true, data: await getPublicSmtpSettings() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SMTP test failed.";
      await updateSmtpTestStatus("ERROR", message);
      throw new ApiError(502, message);
    }
  })
);

export default router;
