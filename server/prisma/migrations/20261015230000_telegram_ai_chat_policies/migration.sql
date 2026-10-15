-- Only persistent opt-in configuration; no conversation messages are stored.
-- Every profile stays inactive until a later, explicitly consented activation.
CREATE TABLE "TelegramAiChatPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "chatKind" TEXT NOT NULL,
    "chatTitle" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'OBSERVE',
    "analysisLevel" TEXT NOT NULL DEFAULT 'IMPORTANT',
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxMessagesPerCheck" INTEGER NOT NULL DEFAULT 20,
    "summaryFrequency" TEXT NOT NULL DEFAULT 'DAILY',
    "instructions" TEXT NOT NULL DEFAULT '',
    "notifyImportant" BOOLEAN NOT NULL DEFAULT true,
    "suggestTasks" BOOLEAN NOT NULL DEFAULT true,
    "dailyCreditLimitMilli" INTEGER NOT NULL DEFAULT 2000,
    "monthlyCreditLimitMilli" INTEGER NOT NULL DEFAULT 20000,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAiChatPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiChatPolicy_userId_chatId_key" ON "TelegramAiChatPolicy"("userId","chatId");
CREATE INDEX "TelegramAiChatPolicy_userId_isEnabled_idx" ON "TelegramAiChatPolicy"("userId","isEnabled");
ALTER TABLE "TelegramAiChatPolicy" ADD CONSTRAINT "TelegramAiChatPolicy_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
