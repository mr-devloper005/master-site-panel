import { ContactSubmissionStatus, Prisma } from "@prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../config/db";
import { ApiError } from "../../utils/api-error";
import { sanitizeSiteConfig } from "../sites/site-contract";
import { sendContactEmail } from "./contact-email";

export type ContactSubmissionInput = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  subject?: unknown;
  message?: unknown;
  sourceUrl?: unknown;
  meta?: unknown;
  honeypot?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cleanString = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const cleanOptionalString = (value: unknown, maxLength: number): string | undefined => {
  const cleaned = cleanString(value, maxLength);
  return cleaned || undefined;
};

const cleanMeta = (value: unknown): Prisma.InputJsonObject | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item) || item === null)
    .slice(0, 30);
  if (!entries.length) return undefined;
  return Object.fromEntries(entries) as Prisma.InputJsonObject;
};

export const getSiteContactRecipient = (site: {
  config: Prisma.JsonValue | null;
}): { to?: string; cc: string[]; enabled: boolean; fromName?: string } => {
  const config = sanitizeSiteConfig(site.config);
  return {
    enabled: config.contact?.enabled !== false,
    to: config.contact?.notifyEmail || env.contactDefaultNotifyEmail || undefined,
    cc: config.contact?.ccEmails || [],
    fromName: config.contact?.fromName,
  };
};

export const createContactSubmission = async (
  siteCode: string,
  payload: ContactSubmissionInput,
  requestMeta: Prisma.InputJsonObject = {}
) => {
  if (payload.honeypot) {
    throw new ApiError(400, "Invalid contact request.");
  }

  const site = await prisma.site.findUnique({
    where: { code: siteCode },
    select: { id: true, code: true, name: true, config: true, isActive: true },
  });

  if (!site || !site.isActive) {
    throw new ApiError(404, "Site not found.");
  }

  const name = cleanString(payload.name, 200);
  const email = cleanString(payload.email, 320).toLowerCase();
  const phone = cleanOptionalString(payload.phone, 80);
  const subject = cleanOptionalString(payload.subject, 200);
  const message = cleanString(payload.message, 10000);
  const sourceUrl = cleanOptionalString(payload.sourceUrl, 500);

  if (!name) throw new ApiError(400, "Name is required.");
  if (!emailPattern.test(email)) throw new ApiError(400, "Valid email is required.");
  if (message.length < 10) throw new ApiError(400, "Message must be at least 10 characters.");

  const meta: Prisma.InputJsonObject = {
    ...requestMeta,
    ...(cleanMeta(payload.meta) || {}),
  };

  const submission = await prisma.contactSubmission.create({
    data: {
      siteId: site.id,
      name,
      email,
      phone,
      subject,
      message,
      sourceUrl,
      meta,
    },
    include: {
      site: {
        select: { id: true, code: true, name: true },
      },
    },
  });

  const recipient = getSiteContactRecipient(site);
  if (!recipient.enabled) {
    return { submission, mail: { sent: false, skipped: "Contact email is disabled for this site." } };
  }

  if (!recipient.to) {
    await prisma.contactSubmission.update({
      where: { id: submission.id },
      data: { emailError: "No contact notify email configured." },
    });
    return { submission, mail: { sent: false, skipped: "No contact notify email configured." } };
  }

  try {
    await sendContactEmail({
      to: recipient.to,
      cc: recipient.cc,
      siteName: site.name,
      siteCode: site.code,
      name,
      email,
      phone,
      subject,
      message,
      sourceUrl,
    });
    const updated = await prisma.contactSubmission.update({
      where: { id: submission.id },
      data: { emailSentAt: new Date(), emailError: null },
      include: {
        site: {
          select: { id: true, code: true, name: true },
        },
      },
    });
    return { submission: updated, mail: { sent: true } };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Email send failed.";
    await prisma.contactSubmission.update({
      where: { id: submission.id },
      data: { emailError: messageText.slice(0, 500) },
    });
    return { submission, mail: { sent: false, error: messageText } };
  }
};

export const normalizeContactStatus = (value: unknown): ContactSubmissionStatus | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized in ContactSubmissionStatus) return normalized as ContactSubmissionStatus;
  return undefined;
};
