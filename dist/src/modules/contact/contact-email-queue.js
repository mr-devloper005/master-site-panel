"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startContactEmailQueueWorker = exports.processContactEmailQueue = exports.enqueueContactEmail = void 0;
const client_1 = require("@prisma/client");
const env_1 = require("../../config/env");
const db_1 = require("../../config/db");
const contact_email_1 = require("./contact-email");
const smtp_settings_service_1 = require("../settings/smtp-settings-service");
const retryDelayMs = (attempts) => {
    const minutes = [1, 5, 15][Math.min(attempts, 2)];
    return minutes * 60 * 1000;
};
const enqueueContactEmail = async (input) => {
    const settings = await (0, smtp_settings_service_1.getResolvedSmtpSettings)();
    return db_1.prisma.contactEmailQueue.create({
        data: {
            contactSubmissionId: input.contactSubmissionId,
            type: input.type,
            toEmail: input.email.to,
            ccEmails: input.email.cc || [],
            fromEmail: input.email.from || settings?.fromEmail || env_1.env.smtpFrom || env_1.env.smtpUser || "not-configured@example.com",
            replyTo: input.email.replyTo,
            subject: input.email.subject,
            textBody: input.email.text,
            htmlBody: input.email.html,
        },
    });
};
exports.enqueueContactEmail = enqueueContactEmail;
const processContactEmailQueue = async (limit = env_1.env.contactEmailQueueBatchSize) => {
    const now = new Date();
    const queueItems = await db_1.prisma.contactEmailQueue.findMany({
        where: {
            status: client_1.ContactEmailQueueStatus.PENDING,
            nextAttemptAt: { lte: now },
            attempts: { lt: 3 },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
    });
    for (const item of queueItems) {
        const locked = await db_1.prisma.contactEmailQueue.updateMany({
            where: {
                id: item.id,
                status: client_1.ContactEmailQueueStatus.PENDING,
            },
            data: {
                status: client_1.ContactEmailQueueStatus.SENDING,
            },
        });
        if (locked.count !== 1)
            continue;
        try {
            await (0, contact_email_1.sendContactEmail)({
                to: item.toEmail,
                cc: item.ccEmails,
                from: item.fromEmail === "not-configured@example.com" ? undefined : item.fromEmail,
                replyTo: item.replyTo || undefined,
                subject: item.subject,
                text: item.textBody,
                html: item.htmlBody,
            });
            await db_1.prisma.contactEmailQueue.update({
                where: { id: item.id },
                data: {
                    status: client_1.ContactEmailQueueStatus.SENT,
                    sentAt: new Date(),
                    lastError: null,
                },
            });
            if (item.type === client_1.ContactEmailQueueType.TEAM_NOTIFICATION) {
                await db_1.prisma.contactSubmission.update({
                    where: { id: item.contactSubmissionId },
                    data: { emailSentAt: new Date(), emailError: null },
                });
            }
        }
        catch (error) {
            const nextAttempts = item.attempts + 1;
            const finalFailure = nextAttempts >= item.maxAttempts;
            const errorMessage = error instanceof Error ? error.message : "Email send failed.";
            await db_1.prisma.contactEmailQueue.update({
                where: { id: item.id },
                data: {
                    status: finalFailure ? client_1.ContactEmailQueueStatus.FAILED : client_1.ContactEmailQueueStatus.PENDING,
                    attempts: nextAttempts,
                    nextAttemptAt: new Date(Date.now() + retryDelayMs(nextAttempts)),
                    lastError: errorMessage.slice(0, 1000),
                },
            });
            if (item.type === client_1.ContactEmailQueueType.TEAM_NOTIFICATION) {
                await db_1.prisma.contactSubmission.update({
                    where: { id: item.contactSubmissionId },
                    data: { emailError: errorMessage.slice(0, 500) },
                });
            }
        }
    }
    return { processed: queueItems.length };
};
exports.processContactEmailQueue = processContactEmailQueue;
let queueTimer = null;
let processing = false;
const startContactEmailQueueWorker = () => {
    if (!env_1.env.contactEmailQueueEnabled || queueTimer)
        return;
    const tick = async () => {
        if (processing)
            return;
        processing = true;
        try {
            await (0, exports.processContactEmailQueue)();
        }
        catch (error) {
            console.error("Contact email queue worker failed", error);
        }
        finally {
            processing = false;
        }
    };
    queueTimer = setInterval(tick, env_1.env.contactEmailQueueIntervalMs);
    queueTimer.unref?.();
    void tick();
};
exports.startContactEmailQueueWorker = startContactEmailQueueWorker;
