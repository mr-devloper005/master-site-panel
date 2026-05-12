-- CreateEnum
CREATE TYPE "ContactEmailQueueStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ContactEmailQueueType" AS ENUM ('VISITOR_ACK', 'TEAM_NOTIFICATION');

-- CreateTable
CREATE TABLE "ContactEmailQueue" (
    "id" TEXT NOT NULL,
    "contactSubmissionId" TEXT NOT NULL,
    "type" "ContactEmailQueueType" NOT NULL,
    "status" "ContactEmailQueueStatus" NOT NULL DEFAULT 'PENDING',
    "toEmail" TEXT NOT NULL,
    "ccEmails" TEXT[],
    "fromEmail" TEXT NOT NULL,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactEmailQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactEmailQueue_status_nextAttemptAt_idx" ON "ContactEmailQueue"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ContactEmailQueue_contactSubmissionId_type_idx" ON "ContactEmailQueue"("contactSubmissionId", "type");

-- AddForeignKey
ALTER TABLE "ContactEmailQueue" ADD CONSTRAINT "ContactEmailQueue_contactSubmissionId_fkey" FOREIGN KEY ("contactSubmissionId") REFERENCES "ContactSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
