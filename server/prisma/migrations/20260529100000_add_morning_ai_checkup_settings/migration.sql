ALTER TABLE "User"
ADD COLUMN "morningAiCheckupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "morningAiCheckupTime" TEXT NOT NULL DEFAULT '10:00',
ADD COLUMN "lastMorningAiCheckupDate" TEXT;

UPDATE "User"
SET "morningAiCheckupEnabled" = false,
    "morningAiCheckupTime" = '10:00',
    "lastMorningAiCheckupDate" = NULL;
