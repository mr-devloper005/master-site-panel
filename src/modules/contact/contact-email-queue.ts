import { ContactEmailQueueStatus, ContactEmailQueueType } from "@prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../config/db";
import { ContactEmailPayload, sendContactEmail } from "./contact-email";

const retryDelayMs = (attempts: number): number => {
  const minutes = [1, 5, 15][Math.min(attempts, 2)];
  return minutes * 60 * 1000;
};

export const enqueueContactEmail = async (input: {
  contactSubmissionId: string;
  type: ContactEmailQueueType;
  email: ContactEmailPayload;
}) => {
  return prisma.contactEmailQueue.create({
    data: {
      contactSubmissionId: input.contactSubmissionId,
      type: input.type,
      toEmail: input.email.to,
      ccEmails: input.email.cc || [],
      fromEmail: input.email.from || env.smtpFrom || env.smtpUser,
      replyTo: input.email.replyTo,
      subject: input.email.subject,
      textBody: input.email.text,
      htmlBody: input.email.html,
    },
  });
};

export const processContactEmailQueue = async (limit = env.contactEmailQueueBatchSize) => {
  const now = new Date();
  const queueItems = await prisma.contactEmailQueue.findMany({
    where: {
      status: ContactEmailQueueStatus.PENDING,
      nextAttemptAt: { lte: now },
      attempts: { lt: 3 },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const item of queueItems) {
    const locked = await prisma.contactEmailQueue.updateMany({
      where: {
        id: item.id,
        status: ContactEmailQueueStatus.PENDING,
      },
      data: {
        status: ContactEmailQueueStatus.SENDING,
      },
    });

    if (locked.count !== 1) continue;

    try {
      await sendContactEmail({
        to: item.toEmail,
        cc: item.ccEmails,
        from: item.fromEmail,
        replyTo: item.replyTo || undefined,
        subject: item.subject,
        text: item.textBody,
        html: item.htmlBody,
      });

      await prisma.contactEmailQueue.update({
        where: { id: item.id },
        data: {
          status: ContactEmailQueueStatus.SENT,
          sentAt: new Date(),
          lastError: null,
        },
      });

      if (item.type === ContactEmailQueueType.TEAM_NOTIFICATION) {
        await prisma.contactSubmission.update({
          where: { id: item.contactSubmissionId },
          data: { emailSentAt: new Date(), emailError: null },
        });
      }
    } catch (error) {
      const nextAttempts = item.attempts + 1;
      const finalFailure = nextAttempts >= item.maxAttempts;
      const errorMessage = error instanceof Error ? error.message : "Email send failed.";

      await prisma.contactEmailQueue.update({
        where: { id: item.id },
        data: {
          status: finalFailure ? ContactEmailQueueStatus.FAILED : ContactEmailQueueStatus.PENDING,
          attempts: nextAttempts,
          nextAttemptAt: new Date(Date.now() + retryDelayMs(nextAttempts)),
          lastError: errorMessage.slice(0, 1000),
        },
      });

      if (item.type === ContactEmailQueueType.TEAM_NOTIFICATION) {
        await prisma.contactSubmission.update({
          where: { id: item.contactSubmissionId },
          data: { emailError: errorMessage.slice(0, 500) },
        });
      }
    }
  }

  return { processed: queueItems.length };
};

let queueTimer: NodeJS.Timeout | null = null;
let processing = false;

export const startContactEmailQueueWorker = () => {
  if (!env.contactEmailQueueEnabled || queueTimer) return;

  const tick = async () => {
    if (processing) return;
    processing = true;
    try {
      await processContactEmailQueue();
    } catch (error) {
      console.error("Contact email queue worker failed", error);
    } finally {
      processing = false;
    }
  };

  queueTimer = setInterval(tick, env.contactEmailQueueIntervalMs);
  queueTimer.unref?.();
  void tick();
};
