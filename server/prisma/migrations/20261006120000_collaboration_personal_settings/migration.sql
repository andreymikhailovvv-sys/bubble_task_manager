-- Personal settings belong to each collaboration member, not to the shared Task.
ALTER TABLE "CollaborativeTaskMember"
  ADD COLUMN "importance" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "urgency" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "notifyBeforeMinutes" INTEGER DEFAULT 0,
  ADD COLUMN "aiNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recurrenceText" TEXT,
  ADD COLUMN "recurrenceJson" JSONB,
  ADD COLUMN "recurrenceSummary" TEXT,
  ADD COLUMN "recurrenceUntil" TIMESTAMP(3),
  ADD COLUMN "telegramNotifiedAt" TIMESTAMP(3);

-- Preserve existing settings on every member when upgrading previously shared tasks.
UPDATE "CollaborativeTaskMember" AS member
SET
  "importance" = task."importance",
  "urgency" = task."urgency",
  "notifyBeforeMinutes" = task."notifyBeforeMinutes",
  "aiNotificationsEnabled" = task."aiNotificationsEnabled",
  "isRecurring" = task."isRecurring",
  "recurrenceText" = task."recurrenceText",
  "recurrenceJson" = task."recurrenceJson",
  "recurrenceSummary" = task."recurrenceSummary",
  "recurrenceUntil" = task."recurrenceUntil"
FROM "CollaborativeTask" AS collaboration
JOIN "Task" AS task ON task."id" = collaboration."rootTaskId"
WHERE member."collaborationId" = collaboration."id";
