ALTER TABLE "User"
ADD COLUMN "efficiencyTaskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "efficiencyHabitScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "efficiencyAiScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "efficiencyFocusScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "efficiencyLastActivityAt" TIMESTAMP(3);

UPDATE "User"
SET "efficiencyTaskScore" = LEAST(25, GREATEST(0, "efficiencyScore") / 4),
    "efficiencyHabitScore" = LEAST(25, GREATEST(0, "efficiencyScore") / 4),
    "efficiencyAiScore" = LEAST(25, GREATEST(0, "efficiencyScore") / 4),
    "efficiencyFocusScore" = LEAST(25, GREATEST(0, "efficiencyScore") / 4),
    "efficiencyLastActivityAt" = "updatedAt"
WHERE "efficiencyScore" > 0;
