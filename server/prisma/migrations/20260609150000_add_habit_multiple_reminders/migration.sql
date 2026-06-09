ALTER TABLE "Habit" ADD COLUMN "reminderTimes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Habit" ADD COLUMN "reminderSnoozedUntil" TIMESTAMP(3);
ALTER TABLE "Habit" ADD COLUMN "lastReminderNotifiedKey" TEXT;
UPDATE "Habit" SET "reminderTimes" = to_jsonb(ARRAY["reminderTime"]::text[]) WHERE "reminderTime" IS NOT NULL AND "reminderTime" <> '';
