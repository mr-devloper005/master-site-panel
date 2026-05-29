CREATE TABLE "AiPostingSettings" (
  "id" TEXT NOT NULL,
  "model" TEXT NOT NULL DEFAULT 'gpt-5.1-nano',
  "apiKeyCipher" TEXT,
  "openAiApiUrl" TEXT,
  "defaultWordCount" INTEGER NOT NULL DEFAULT 600,
  "retryOn404" BOOLEAN NOT NULL DEFAULT true,
  "requestTimeoutMs" INTEGER NOT NULL DEFAULT 12000,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastTestAt" TIMESTAMP(3),
  "lastTestStatus" TEXT,
  "lastTestError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiPostingSettings_pkey" PRIMARY KEY ("id")
);
