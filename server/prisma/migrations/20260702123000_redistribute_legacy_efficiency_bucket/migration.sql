UPDATE "User"
SET "efficiencyTaskScore" = LEAST(25, GREATEST(0, "efficiencyScore") / 4),
    "efficiencyHabitScore" = LEAST(25, GREATEST(0, "efficiencyScore") / 4),
    "efficiencyAiScore" = LEAST(25, GREATEST(0, "efficiencyScore") / 4),
    "efficiencyFocusScore" = LEAST(25, GREATEST(0, "efficiencyScore") / 4)
WHERE "efficiencyScore" > 0
  AND "efficiencyTaskScore" = LEAST(100, GREATEST(0, "efficiencyScore"))
  AND "efficiencyHabitScore" = 0
  AND "efficiencyAiScore" = 0
  AND "efficiencyFocusScore" = 0;
