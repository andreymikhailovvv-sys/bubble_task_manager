-- Dedicated timeline-only reminders; existing TASK/EVENT rows remain unchanged.
ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'REMINDER';
