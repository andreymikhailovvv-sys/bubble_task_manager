CREATE TYPE "HabitDurationMode" AS ENUM ('FOREVER', 'UNTIL_DATE', 'REPEAT_COUNT');
CREATE TYPE "HabitCompletionSource" AS ENUM ('MANUAL', 'AUTO_DURATION');

ALTER TABLE "Habit"
  ADD COLUMN "durationMode" "HabitDurationMode" NOT NULL DEFAULT 'FOREVER',
  ADD COLUMN "endDate" TIMESTAMP(3),
  ADD COLUMN "totalRepeatTarget" INTEGER,
  ADD COLUMN "isAutoCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoCompletedAt" TIMESTAMP(3);

ALTER TABLE "HabitCompletion"
  ADD COLUMN "source" "HabitCompletionSource" NOT NULL DEFAULT 'MANUAL';

CREATE INDEX "Habit_userId_isAutoCompleted_idx" ON "Habit"("userId", "isAutoCompleted");
