-- Quick AI should retain explicit Telegram/mail action cards after reload.
ALTER TABLE "GeneralAiMessage"
  ADD COLUMN "telegramSendDraft" JSONB,
  ADD COLUMN "telegramReadDraft" JSONB,
  ADD COLUMN "mailSendDraft" JSONB;
