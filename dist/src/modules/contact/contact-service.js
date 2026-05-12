"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeContactStatus = exports.createContactSubmission = exports.getSiteContactRecipient = void 0;
const client_1 = require("@prisma/client");
const env_1 = require("../../config/env");
const db_1 = require("../../config/db");
const api_error_1 = require("../../utils/api-error");
const site_contract_1 = require("../sites/site-contract");
const contact_email_1 = require("./contact-email");
const contact_email_queue_1 = require("./contact-email-queue");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanString = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";
const cleanOptionalString = (value, maxLength) => {
    const cleaned = cleanString(value, maxLength);
    return cleaned || undefined;
};
const cleanMeta = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const entries = Object.entries(value)
        .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item) || item === null)
        .slice(0, 30);
    if (!entries.length)
        return undefined;
    return Object.fromEntries(entries);
};
const getSiteContactRecipient = (site) => {
    const config = (0, site_contract_1.sanitizeSiteConfig)(site.config);
    return {
        enabled: config.contact?.enabled !== false,
        to: config.contact?.notifyEmail || env_1.env.contactDefaultNotifyEmail || undefined,
        cc: config.contact?.ccEmails || [],
        fromName: config.contact?.fromName,
    };
};
exports.getSiteContactRecipient = getSiteContactRecipient;
const createContactSubmission = async (siteCode, payload, requestMeta = {}) => {
    if (payload.honeypot) {
        throw new api_error_1.ApiError(400, "Invalid contact request.");
    }
    const site = await db_1.prisma.site.findUnique({
        where: { code: siteCode },
        select: { id: true, code: true, name: true, config: true, isActive: true },
    });
    if (!site || !site.isActive) {
        throw new api_error_1.ApiError(404, "Site not found.");
    }
    const name = cleanString(payload.name, 200);
    const email = cleanString(payload.email, 320).toLowerCase();
    const phone = cleanOptionalString(payload.phone, 80);
    const subject = cleanOptionalString(payload.subject, 200);
    const message = cleanString(payload.message, 10000);
    const sourceUrl = cleanOptionalString(payload.sourceUrl, 500);
    if (!name)
        throw new api_error_1.ApiError(400, "Name is required.");
    if (!emailPattern.test(email))
        throw new api_error_1.ApiError(400, "Valid email is required.");
    if (message.length < 10)
        throw new api_error_1.ApiError(400, "Message must be at least 10 characters.");
    const meta = {
        ...requestMeta,
        ...(cleanMeta(payload.meta) || {}),
    };
    const submission = await db_1.prisma.contactSubmission.create({
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
    const recipient = (0, exports.getSiteContactRecipient)(site);
    const queued = [];
    queued.push(await (0, contact_email_queue_1.enqueueContactEmail)({
        contactSubmissionId: submission.id,
        type: client_1.ContactEmailQueueType.VISITOR_ACK,
        email: (0, contact_email_1.buildVisitorAckEmail)({
            to: email,
            siteName: site.name,
            name,
            subject,
        }),
    }));
    if (recipient.enabled && recipient.to) {
        queued.push(await (0, contact_email_queue_1.enqueueContactEmail)({
            contactSubmissionId: submission.id,
            type: client_1.ContactEmailQueueType.TEAM_NOTIFICATION,
            email: (0, contact_email_1.buildTeamNotificationEmail)({
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
            }),
        }));
    }
    else if (!recipient.to) {
        await db_1.prisma.contactSubmission.update({
            where: { id: submission.id },
            data: { emailError: "No contact notify email configured." },
        });
    }
    const queuedSubmission = await db_1.prisma.contactSubmission.findUniqueOrThrow({
        where: { id: submission.id },
        include: {
            site: {
                select: { id: true, code: true, name: true },
            },
            queuedEmails: {
                orderBy: { createdAt: "asc" },
            },
        },
    });
    return {
        submission: queuedSubmission,
        mail: {
            queued: queued.length,
            visitorAckQueued: queued.some((item) => item.type === client_1.ContactEmailQueueType.VISITOR_ACK),
            teamNotificationQueued: queued.some((item) => item.type === client_1.ContactEmailQueueType.TEAM_NOTIFICATION),
            skipped: !recipient.enabled
                ? "Contact team notification is disabled for this site."
                : !recipient.to
                    ? "No contact notify email configured."
                    : undefined,
        },
    };
};
exports.createContactSubmission = createContactSubmission;
const normalizeContactStatus = (value) => {
    if (typeof value !== "string")
        return undefined;
    const normalized = value.trim().toUpperCase();
    if (normalized in client_1.ContactSubmissionStatus)
        return normalized;
    return undefined;
};
exports.normalizeContactStatus = normalizeContactStatus;
