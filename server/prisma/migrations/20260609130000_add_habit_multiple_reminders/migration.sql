-- CreateEnum
CREATE TYPE "HabitReminderSource" AS ENUM ('SCHEDULED', 'SNOOZE');

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN "reminderTimes" JSONB NOT NULL DEFAULT '[]';

-- Backfill previous single reminder into the new multiple-reminders storage.
UPDATE "Habit"
SET "reminderTimes" = jsonb_build_array("reminderTime")
WHERE "reminderTime" IS NOT NULL AND "reminderTime" <> '';

-- CreateTable
CREATE TABLE "HabitReminderDelivery" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "reminderTime" TEXT NOT NULL,
    "source" "HabitReminderSource" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HabitReminderDelivery_habitId_dateKey_reminderTime_source_key" ON "HabitReminderDelivery"("habitId", "dateKey", "reminderTime", "source");

-- CreateIndex
CREATE INDEX "HabitReminderDelivery_habitId_idx" ON "HabitReminderDelivery"("habitId");

-- CreateIndex
CREATE INDEX "HabitReminderDelivery_userId_idx" ON "HabitReminderDelivery"("userId");

-- CreateIndex
CREATE INDEX "HabitReminderDelivery_scheduledAt_sentAt_idx" ON "HabitReminderDelivery"("scheduledAt", "sentAt");

-- AddForeignKey
ALTER TABLE "HabitReminderDelivery" ADD CONSTRAINT "HabitReminderDelivery_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitReminderDelivery" ADD CONSTRAINT "HabitReminderDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
