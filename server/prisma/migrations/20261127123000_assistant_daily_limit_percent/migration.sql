ALTER TABLE "TelegramAiChatPolicy" ADD COLUMN "dailyCreditLimitPercent" INTEGER CHECK ("dailyCreditLimitPercent" BETWEEN 0 AND 100);
ALTER TABLE "EmailMailbox" ADD COLUMN "dailyCreditLimitPercent" INTEGER CHECK ("dailyCreditLimitPercent" BETWEEN 0 AND 100);
