ALTER TABLE "TelegramSession"
ADD COLUMN IF NOT EXISTS "registrationLogin" TEXT,
ADD COLUMN IF NOT EXISTS "registrationPasswordHash" TEXT;
